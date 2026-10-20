import fs from "node:fs";
import path from "node:path";

const output = process.argv[2];

if (!output) {
  throw new Error(
    "Usage: project-hosted-catalogue.mjs <output>"
  );
}

const coreUrl =
  process.env.CORE_URL ??
  "https://core.orangepeelit.co.uk";


async function readJson(url) {
  const response =
    await fetch(
      url,
      {
        headers: {
          accept: "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Core read failed: HTTP ${response.status}`
    );
  }

  return response.json();
}


function unwrapRecord(operation) {
  let value =
    operation?.record ?? null;

  for (
    let depth = 0;
    depth < 8;
    depth++
  ) {
    if (!value) {
      return null;
    }

    if (
      typeof value === "object" &&
      typeof value.id === "string"
    ) {
      return value;
    }

    if (
      typeof value?.record === "object"
    ) {
      value = value.record;
      continue;
    }

    if (
      typeof value?.value === "object"
    ) {
      value = value.value;
      continue;
    }

    return null;
  }

  return null;
}


function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


function normaliseLifecycle(value) {
  const text =
    String(value ?? "UNKNOWN")
      .trim()
      .toUpperCase()
      .replaceAll("_", " ");

  const map = {
    BACKLOG: "BACKLOG",
    PRIORITISED: "PRIORITISED",
    PRIORITIZED: "PRIORITISED",
    "IN BUILD": "IN BUILD",
    DEPLOYED: "DEPLOYED",
    UNKNOWN: "UNKNOWN"
  };

  return map[text] ?? "UNKNOWN";
}


function lifecycleLabel(value) {
  return {
    BACKLOG: "Backlog",
    PRIORITISED: "Prioritised",
    "IN BUILD": "In Build",
    DEPLOYED: "Deployed",
    UNKNOWN: "Status unknown"
  }[
    normaliseLifecycle(value)
  ];
}


const head =
  await readJson(
    `${coreUrl}/v1/core/head`
  );


const transactions = [];
let after = 0;

while (true) {
  const page =
    await readJson(
      `${coreUrl}/v1/core/transactions?after=${after}&limit=500`
    );

  const rows =
    page.transactions ?? [];

  if (!rows.length) {
    break;
  }

  transactions.push(...rows);

  after =
    Math.max(
      ...rows.map(
        row =>
          Number(row.checkpoint)
      )
    );

  if (rows.length < 500) {
    break;
  }
}


const current =
  new Map();

const provenance =
  new Map();


for (
  const transaction
  of transactions
) {
  for (
    const operation
    of transaction
      ?.transaction
      ?.proposal
      ?.operations ?? []
  ) {
    if (
      operation?.kind !==
      "collection.record.upsert"
    ) {
      continue;
    }

    const record =
      unwrapRecord(operation);

    if (!record?.id) {
      continue;
    }

    current.set(
      record.id,
      structuredClone(record)
    );

    provenance.set(
      record.id,
      {
        checkpoint:
          transaction.checkpoint,

        transactionHash:
          transaction.transactionHash
      }
    );
  }
}


const records =
  [...current.values()];


function isKind(record, kind) {
  return (
    String(
      record?.kind ?? ""
    ).toLowerCase() ===
    kind.toLowerCase()
  );
}


function recordValue(id) {
  return (
    current.get(id)
      ?.literal
      ?.value ??
    null
  );
}


const shell =
  recordValue(
    "org.orangepeelit.presentation.microsite-shell.v1"
  );

const typography =
  recordValue(
    "org.orangepeelit.presentation.claim.typography-v1"
  );

const colours =
  recordValue(
    "org.orangepeelit.presentation.claim.colours-v1"
  );


if (
  !shell ||
  !typography ||
  !colours
) {
  throw new Error(
    "Governed microsite presentation is incomplete."
  );
}


const legacyRules = [
  {
    prefix: "org.orangepeelit.product.",
    category: "Product"
  },
  {
    prefix: "org.orangepeelit.application.",
    category: "Application"
  },
  {
    prefix: "org.orangepeelit.utility.",
    category: "Utility"
  }
];


function legacyCategory(id) {
  return (
    legacyRules.find(
      rule =>
        id.startsWith(rule.prefix)
    )?.category ??
    null
  );
}


function assertionsFor(subjectRef) {
  return records.filter(
    record =>
      isKind(record, "Assertion") &&
      record.subjectRef === subjectRef
  );
}


function claim(subjectRef, key) {
  const matches =
    assertionsFor(subjectRef)
      .filter(
        record =>
          record?.literal?.key === key
      );

  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}


function literal(record) {
  return (
    record
      ?.literal
      ?.value ??
    null
  );
}


const legacyItems =
  records
    .filter(
      record =>
        isKind(record, "Entity") &&
        legacyCategory(record.id)
    )
    .map(
      identity => {
        const display =
          claim(
            identity.id,
            "displayName"
          );

        const summary =
          claim(
            identity.id,
            "publicSummary"
          );

        const demonstration =
          claim(
            identity.id,
            "demonstrationStatus"
          );

        if (
          !display ||
          !summary
        ) {
          return null;
        }

        const demo =
          literal(demonstration);

        const live =
          demo?.status === "LIVE";

        return {
          id:
            identity.id,

          category:
            legacyCategory(
              identity.id
            ),

          displayName:
            literal(display),

          publicSummary:
            literal(summary),

          lifecycleState:
            live
              ? "DEPLOYED"
              : "UNKNOWN",

          demonstrationStatus:
            demo?.status ??
            "NOT_DEMONSTRABLE",

          demonstrationUrl:
            demo?.demonstrationUrl ??
            null,

          sourceModel:
            "legacy-entity-assertions",

          provenance: {
            identity:
              provenance.get(identity.id),

            displayName:
              provenance.get(display.id),

            publicSummary:
              provenance.get(summary.id),

            demonstration:
              demonstration
                ? provenance.get(
                    demonstration.id
                  )
                : null
          }
        };
      }
    )
    .filter(Boolean);


const directItems =
  records
    .filter(
      record =>
        [
          "product",
          "application",
          "utility"
        ].includes(
          String(
            record?.kind ?? ""
          ).toLowerCase()
        ) &&
        String(
          record?.id ?? ""
        ).startsWith(
          "org.orangepeelit.product."
        )
    )
    .map(
      record => ({
        id:
          record.id,

        category:
          String(record.kind),

        displayName:
          record.name ??
          record.title ??
          record.id,

        publicSummary:
          record.statement ??
          "",

        lifecycleState:
          normaliseLifecycle(
            record.lifecycleState
          ),

        demonstrationStatus:
          null,

        demonstrationUrl:
          record.demonstrationUrl ??
          record.url ??
          null,

        sourceModel:
          "direct-portfolio-record",

        provenance: {
          identity:
            provenance.get(record.id)
        }
      })
    );


const merged =
  new Map();


for (
  const item
  of legacyItems
) {
  merged.set(
    String(
      item.displayName
    ).toLowerCase(),
    item
  );
}


for (
  const item
  of directItems
) {
  const key =
    String(
      item.displayName
    ).toLowerCase();

  const previous =
    merged.get(key);

  merged.set(
    key,
    {
      ...previous,
      ...item,

      demonstrationUrl:
        item.demonstrationUrl ??
        previous?.demonstrationUrl ??
        null,

      demonstrationStatus:
        item.demonstrationStatus ??
        previous?.demonstrationStatus ??
        null,

      provenance: {
        ...(previous?.provenance ?? {}),
        ...(item.provenance ?? {})
      }
    }
  );
}


const items =
  [...merged.values()]
    .sort(
      (a, b) => {
        const order = {
          Product: 0,
          Application: 1,
          Utility: 2
        };

        return (
          (order[a.category] ?? 99) -
            (order[b.category] ?? 99) ||
          String(a.displayName)
            .localeCompare(
              String(b.displayName),
              "en-GB"
            )
        );
      }
    );


if (!items.length) {
  throw new Error(
    "Hosted APEX contains no portfolio records."
  );
}


function card(item) {
  const lifecycle =
    normaliseLifecycle(
      item.lifecycleState
    );

  const status =
    lifecycleLabel(
      lifecycle
    );

  const statusClass =
    "status-" +
    lifecycle
      .toLowerCase()
      .replaceAll(" ", "-");

  const action =
    lifecycle === "DEPLOYED" &&
    item.demonstrationUrl
      ? `
        <a
          class="card-action"
          href="${esc(
            item.demonstrationUrl
          )}"
        >
          Open ${esc(
            item.displayName
          )}
          <span aria-hidden="true">→</span>
        </a>
      `
      : "";

  return `
    <article
      class="product-card"
      data-product-card
      data-name="${esc(
        item.displayName
      )}"
      data-type="${esc(
        item.category
      )}"
      data-lifecycle="${esc(
        lifecycle
      )}"
    >

      <div class="card-top">

        <img
          class="product-icon"
          src="assets/favicon-32.png"
          alt=""
          width="44"
          height="44"
        >

        <span
          class="status ${statusClass}"
        >
          ${esc(status)}
        </span>

      </div>

      <p class="product-type">
        ${esc(item.category)}
      </p>

      <h3>
        ${esc(item.displayName)}
      </h3>

      <p class="product-summary">
        ${esc(item.publicSummary)}
      </p>

      ${action}

    </article>
  `;
}


const html = `<!doctype html>
<html lang="en-GB">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>Catalogue | Orange Peel IT</title>

<link
  rel="preconnect"
  href="https://fonts.googleapis.com"
>

<link
  rel="preconnect"
  href="https://fonts.gstatic.com"
  crossorigin
>

<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Manrope:wght@500;600;700&display=swap"
  rel="stylesheet"
>

<link
  rel="stylesheet"
  href="styles.css?v=${head.checkpoint}"
>

</head>

<body>

<header class="site-header">

  <a
    class="brand"
    href="#top"
  >
    <span class="brand-dot"></span>
    <strong>Catalogue</strong>
  </a>

  <nav aria-label="Primary">
    <a href="#portfolio">Portfolio</a>
    <a href="#about">About</a>
  </nav>

</header>


<main>

<section
  class="hero"
  id="top"
>

  <div class="hero-inner">

    <p class="eyebrow">
      ORANGE PEEL IT
    </p>

    <h1>Catalogue</h1>

    <p class="hero-statement">
      Products, applications and utilities from the governed Orange Peel portfolio.
    </p>

    <p class="hero-support">
      What exists, what is planned and where it is in delivery.
      APEX remains the authority; Catalogue is the view.
    </p>

  </div>

</section>


<section
  class="portfolio"
  id="portfolio"
>

  <div class="section-heading">

    <div>

      <p class="section-label">
        PORTFOLIO
      </p>

      <h2>
        What Orange Peel is building.
      </h2>

    </div>

  </div>

  <div
    class="product-grid"
    id="product-grid"
  >
    ${items
      .map(card)
      .join("\n")}
  </div>

</section>


<section
  class="about"
  id="about"
>

  <div>

    <p class="section-label">
      HOW IT WORKS
    </p>

    <h2>
      One governed source.
      Different useful views.
    </h2>

  </div>

  <div class="about-copy">

    <p>
      Catalogue does not maintain a separate product inventory.
      It projects the current portfolio directly from APEX.
    </p>

    <p>
      Backlog, prioritised, in-build and deployed state comes from governed product knowledge.
      Test evidence remains separate from delivery state.
    </p>

  </div>

</section>

</main>


<footer class="site-footer">

  <div class="footer-brand">

    <img
      src="${esc(
        shell.footerLogoAsset
      )}"
      alt="${esc(
        shell.footerLogoAlt
      )}"
    >

    <div>

      <strong>
        Catalogue
      </strong>

      <p>
        ${esc(
          shell.companyName
        )}
      </p>

    </div>

  </div>

  <div class="built-on-apex">

    <p class="built-label">
      ${esc(
        shell.builtWithLabel
      )}
    </p>

    <p>
      ${esc(
        shell.builtWithText
      )}
    </p>

  </div>

</footer>

</body>

</html>`;


const styles = `
:root {
  --orange:
    ${colours.orange ?? "#ff7412"};

  --orange-dark:
    ${colours.orangeDark ?? "#d95b00"};

  --navy:
    ${colours.navy ?? "#071a2b"};

  --paper:
    #f7f5f1;

  --white:
    #ffffff;

  --ink:
    #152534;

  --muted:
    #62707d;

  --line:
    rgba(7,26,43,.13);

  --max:
    1240px;
}

* {
  box-sizing:
    border-box;
}

html {
  scroll-behavior:
    smooth;
}

body {
  margin:
    0;

  background:
    var(--paper);

  color:
    var(--ink);

  font-family:
    '${typography.body ?? "DM Sans"}',
    system-ui,
    sans-serif;

  line-height:
    1.55;
}

a {
  color:
    inherit;
}

.site-header {
  position:
    sticky;

  top:
    0;

  z-index:
    20;

  min-height:
    72px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  padding:
    0 max(
      24px,
      calc(
        (100vw - var(--max)) / 2
      )
    );

  background:
    rgba(247,245,241,.95);

  border-bottom:
    1px solid var(--line);
}

.brand {
  display:
    inline-flex;

  align-items:
    center;

  gap:
    10px;

  text-decoration:
    none;

  font-family:
    '${typography.headings ?? "Manrope"}',
    sans-serif;
}

.brand-dot {
  width:
    18px;

  height:
    18px;

  border-radius:
    50%;

  background:
    var(--orange);
}

nav {
  display:
    flex;

  gap:
    26px;
}

nav a {
  text-decoration:
    none;

  color:
    var(--muted);
}

main section {
  width:
    min(
      var(--max),
      calc(100% - 48px)
    );

  margin:
    0 auto;
}

.hero {
  width:
    100%;

  max-width:
    none;

  min-height:
    64vh;

  display:
    flex;

  align-items:
    center;

  border-bottom:
    1px solid var(--line);
}

.hero-inner {
  width:
    min(
      var(--max),
      calc(100% - 48px)
    );

  margin:
    0 auto;

  padding:
    90px 0;
}

.eyebrow,
.section-label,
.product-type {
  margin:
    0 0 16px;

  color:
    var(--orange-dark);

  font-size:
    12px;

  font-weight:
    700;

  letter-spacing:
    .16em;

  text-transform:
    uppercase;
}

h1,
h2,
h3 {
  color:
    var(--navy);

  font-family:
    '${typography.headings ?? "Manrope"}',
    sans-serif;

  letter-spacing:
    -.035em;
}

h1 {
  margin:
    0;

  font-size:
    clamp(
      72px,
      13vw,
      156px
    );

  line-height:
    .84;
}

h2 {
  margin:
    0;

  font-size:
    clamp(
      38px,
      6vw,
      68px
    );

  line-height:
    1.02;
}

h3 {
  margin:
    18px 0 12px;

  font-size:
    30px;
}

.hero-statement {
  max-width:
    930px;

  margin:
    46px 0 0;

  color:
    var(--navy);

  font-size:
    clamp(
      27px,
      4vw,
      47px
    );

  line-height:
    1.14;
}

.hero-support {
  max-width:
    760px;

  margin:
    28px 0 0;

  color:
    var(--muted);

  font-size:
    18px;
}

.portfolio,
.about {
  padding:
    100px 0;

  border-bottom:
    1px solid var(--line);
}

.product-grid {
  display:
    grid;

  grid-template-columns:
    repeat(
      3,
      minmax(0,1fr)
    );

  gap:
    18px;

  margin-top:
    48px;
}

.product-card {
  min-height:
    360px;

  padding:
    28px;

  display:
    flex;

  flex-direction:
    column;

  background:
    var(--white);

  border:
    1px solid var(--line);

  border-radius:
    20px;

  box-shadow:
    0 12px 32px rgba(7,26,43,.055);
}

.card-top {
  min-height:
    44px;

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    flex-start;
}

.product-icon {
  width:
    44px;

  height:
    44px;

  border-radius:
    10px;
}

.status {
  padding:
    7px 11px;

  border-radius:
    999px;

  font-size:
    12px;

  font-weight:
    700;
}

.status-deployed {
  color:
    #17633a;

  background:
    #e5f5eb;
}

.status-backlog {
  color:
    #675317;

  background:
    #f7f0d9;
}

.status-prioritised {
  color:
    #6b3a16;

  background:
    #fff0e4;
}

.status-in-build {
  color:
    #24527a;

  background:
    #e8f1f8;
}

.status-unknown {
  color:
    #67727d;

  background:
    #edf0f2;
}

.product-type {
  margin-top:
    26px;

  margin-bottom:
    0;
}

.product-summary {
  margin:
    0;

  color:
    var(--muted);

  line-height:
    1.65;
}

.card-action {
  width:
    fit-content;

  margin-top:
    auto;

  padding-top:
    30px;

  color:
    var(--navy);

  font-weight:
    700;

  text-decoration:
    none;
}

.about {
  display:
    grid;

  grid-template-columns:
    .9fr 1.1fr;

  gap:
    80px;
}

.about-copy p {
  max-width:
    720px;

  margin:
    0 0 24px;

  color:
    var(--muted);

  font-size:
    18px;

  line-height:
    1.75;
}

.site-footer {
  width:
    min(
      var(--max),
      calc(100% - 48px)
    );

  margin:
    0 auto;

  padding:
    46px 0 70px;

  display:
    flex;

  justify-content:
    space-between;

  gap:
    30px;

  color:
    var(--muted);

  font-size:
    14px;
}

.footer-brand {
  display:
    flex;

  align-items:
    center;

  gap:
    16px;
}

.footer-brand img {
  width:
    auto;

  height:
    42px;

  max-width:
    150px;

  object-fit:
    contain;
}

.built-on-apex {
  max-width:
    560px;
}

.built-label {
  margin-bottom:
    5px;

  color:
    var(--orange-dark);

  font-size:
    11px;

  font-weight:
    700;

  letter-spacing:
    .14em;
}

@media (max-width:880px) {
  .product-grid {
    grid-template-columns:
      1fr 1fr;
  }

  .about {
    grid-template-columns:
      1fr;
  }
}

@media (max-width:600px) {
  .site-header {
    gap:
      16px;
  }

  nav {
    gap:
      14px;
  }

  .product-grid {
    grid-template-columns:
      1fr;
  }

  .site-footer {
    flex-direction:
      column;
  }
}
`.trim() + "\n";


const manifest = {
  format:
    "ORANGEPEELIT_CATALOGUE_HOSTED_PROJECTION_V2",

  generatedFrom:
    "hosted-apex-core",

  checkpoint:
    head.checkpoint,

  transactionHash:
    head.transactionHash,

  portfolioEntries:
    items.length,

  publicItems:
    items.map(
      item => ({
        id:
          item.id,

        displayName:
          item.displayName,

        category:
          item.category,

        publicSummary:
          item.publicSummary,

        lifecycleState:
          item.lifecycleState,

        demonstrationStatus:
          item.demonstrationStatus,

        demonstrationUrl:
          item.demonstrationUrl,

        sourceModel:
          item.sourceModel
      })
    )
};


const traceability = {
  format:
    "ORANGEPEELIT_CATALOGUE_HOSTED_TRACEABILITY_V2",

  checkpoint:
    head.checkpoint,

  transactionHash:
    head.transactionHash,

  portfolio:
    Object.fromEntries(
      items.map(
        item => [
          item.id,
          {
            lifecycleState:
              item.lifecycleState,

            sourceModel:
              item.sourceModel,

            provenance:
              item.provenance
          }
        ]
      )
    ),

  presentation: {
    micrositeShell:
      "org.orangepeelit.presentation.microsite-shell.v1",

    typography:
      "org.orangepeelit.presentation.claim.typography-v1",

    colours:
      "org.orangepeelit.presentation.claim.colours-v1"
  }
};


fs.mkdirSync(
  output,
  {
    recursive: true
  }
);


fs.writeFileSync(
  path.join(
    output,
    "index.html"
  ),
  html,
  "utf8"
);


fs.writeFileSync(
  path.join(
    output,
    "styles.css"
  ),
  styles,
  "utf8"
);


fs.writeFileSync(
  path.join(
    output,
    "projection-manifest.json"
  ),
  JSON.stringify(
    manifest,
    null,
    2
  ) + "\n",
  "utf8"
);


fs.writeFileSync(
  path.join(
    output,
    "traceability.json"
  ),
  JSON.stringify(
    traceability,
    null,
    2
  ) + "\n",
  "utf8"
);


console.log(
  JSON.stringify(
    {
      status:
        "GENERATED",

      checkpoint:
        head.checkpoint,

      transactionHash:
        head.transactionHash,

      records:
        current.size,

      transactions:
        transactions.length,

      portfolioEntries:
        items.length,

      lifecycleCounts:
        items.reduce(
          (result, item) => {
            const key =
              normaliseLifecycle(
                item.lifecycleState
              );

            result[key] =
              (result[key] ?? 0) + 1;

            return result;
          },
          {}
        ),

      portfolio:
        items.map(
          item => ({
            name:
              item.displayName,

            type:
              item.category,

            lifecycle:
              item.lifecycleState,

            source:
              item.sourceModel
          })
        )
    },
    null,
    2
  )
);
