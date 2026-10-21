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


function esc(value) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    );
}


function normaliseLifecycle(value) {
  const text =
    String(
      value ?? ""
    )
      .trim()
      .toUpperCase()
      .replaceAll(
        "_",
        " "
      );

  const known = {
    BACKLOG:
      "BACKLOG",

    PRIORITISED:
      "PRIORITISED",

    PRIORITIZED:
      "PRIORITISED",

    "IN BUILD":
      "IN BUILD",

    DEPLOYED:
      "DEPLOYED"
  };

  return (
    known[text] ??
    "BACKLOG"
  );
}


function lifecycleLabel(value) {
  return {
    BACKLOG:
      "Backlog",

    PRIORITISED:
      "Prioritised",

    "IN BUILD":
      "In Build",

    DEPLOYED:
      "Deployed"
  }[
    normaliseLifecycle(
      value
    )
  ];
}


function maxCheckpoint(values) {
  return Math.max(
    0,
    ...values
      .filter(Boolean)
      .map(
        value =>
          Number(
            value?.checkpoint ?? 0
          )
      )
  );
}


const head =
  await readJson(
    `${coreUrl}/v1/core/head`
  );


const generatedAt =
  new Date();


const versionId =
  `CAT-${head.checkpoint}-${String(
    head.transactionHash
  ).slice(0,8)}`;


const lastUpdated =
  new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",

      timeZone:
        "Europe/London"
    }
  ).format(
    generatedAt
  );


const page =
  await readJson(
    `${coreUrl}/v1/core/records`
  );


const current =
  new Map();

const provenance =
  new Map();


for (
  const record
  of page?.records ?? []
) {

  if (!record?.id) {
    continue;
  }

  current.set(
    record.id,
    structuredClone(
      record
    )
  );

  provenance.set(
    record.id,
    {
      checkpoint:
        Number(
          page?.head?.checkpoint ??
          head.checkpoint ??
          0
        ),

      transactionHash:
        page?.head?.transactionHash ??
        head.transactionHash ??
        null
    }
  );
}


const records =
  [...current.values()];


function isKind(
  record,
  kind
) {
  return (
    String(
      record?.kind ?? ""
    ).toLowerCase() ===
    kind.toLowerCase()
  );
}


function governedLiteralValue(record) {
  const graphLiteral =
    record?.["graph:literalObject"];

  if (
    graphLiteral &&
    typeof graphLiteral === "object" &&
    Object.prototype.hasOwnProperty.call(
      graphLiteral,
      "value"
    )
  ) {
    return graphLiteral.value;
  }

  if (graphLiteral !== undefined) {
    return graphLiteral;
  }

  return (
    record
      ?.literal
      ?.value ??
    null
  );
}


const shell =
  current.get(
    "org.orangepeelit.presentation.system.v1"
  )
    ?.micrositeShell ??
  null;


const typography =
  governedLiteralValue(
    current.get(
      "org.orangepeelit.presentation.claim.typography-v1"
    )
  );


const colours =
  governedLiteralValue(
    current.get(
      "org.orangepeelit.presentation.claim.colours-v1"
    )
  );


if (
  !shell ||
  !typography ||
  !colours
) {
  throw new Error(
    "Catalogue presentation data is incomplete."
  );
}


const legacyRules = [
  {
    prefix:
      "org.orangepeelit.product.",

    category:
      "Product"
  },
  {
    prefix:
      "org.orangepeelit.application.",

    category:
      "Application"
  },
  {
    prefix:
      "org.orangepeelit.utility.",

    category:
      "Utility"
  }
];


function legacyCategory(id) {
  return (
    legacyRules.find(
      rule =>
        id.startsWith(
          rule.prefix
        )
    )?.category ??
    null
  );
}


function assertionSubject(record) {
  return (
    record
      ?.["graph:assertionSubject"]
      ?.["@id"] ??
    record?.subjectRef ??
    null
  );
}


function assertionLiteral(record) {
  return (
    record
      ?.["graph:literalObject"] ??
    record?.literal ??
    null
  );
}


function assertionsFor(subjectRef) {
  return records.filter(
    record =>
      isKind(
        record,
        "Assertion"
      ) &&
      assertionSubject(
        record
      ) ===
        subjectRef
  );
}


function claim(
  subjectRef,
  key
) {

  const matches =
    assertionsFor(
      subjectRef
    ).filter(
      record =>
        assertionLiteral(
          record
        )?.key ===
        key
    );

  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}


function literal(record) {
  return (
    assertionLiteral(
      record
    )?.value ??
    null
  );
}


const legacyItems =
  records
    .filter(
      record =>
        isKind(
          record,
          "Entity"
        ) &&
        legacyCategory(
          record.id
        )
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
          literal(
            demonstration
          );

        const deployed =
          demo?.status ===
          "LIVE";

        const itemProvenance = {
          identity:
            provenance.get(
              identity.id
            ),

          displayName:
            provenance.get(
              display.id
            ),

          publicSummary:
            provenance.get(
              summary.id
            ),

          demonstration:
            demonstration
              ? provenance.get(
                  demonstration.id
                )
              : null
        };

        return {
          id:
            identity.id,

          category:
            legacyCategory(
              identity.id
            ),

          displayName:
            literal(
              display
            ),

          publicSummary:
            literal(
              summary
            ),

          lifecycleState:
            deployed
              ? "DEPLOYED"
              : "BACKLOG",

          demonstrationUrl:
            demo?.demonstrationUrl ??
            null,

          newestCheckpoint:
            maxCheckpoint(
              Object.values(
                itemProvenance
              )
            ),

          sourceModel:
            "legacy",

          provenance:
            itemProvenance
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
        )
    )
    .map(
      record => {

        const itemProvenance =
          provenance.get(
            record.id
          );

        return {
          id:
            record.id,

          category:
            String(
              record.kind
            ),

          displayName:
            record.name ??
            record.title ??
            record.id,

          publicSummary:
            record.publicSummary ??
            record.statement ??
            "",

          lifecycleState:
            normaliseLifecycle(
              record.lifecycleState
            ),

          demonstrationUrl:
            record.demonstrationUrl ??
            record.url ??
            null,

          newestCheckpoint:
            Number(
              itemProvenance
                ?.checkpoint ??
              0
            ),

          sourceModel:
            "portfolio",

          provenance: {
            identity:
              itemProvenance
          }
        };
      }
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
    merged.get(
      key
    );

  merged.set(
    key,
    {
      ...previous,
      ...item,

      demonstrationUrl:
        item.demonstrationUrl ??
        previous?.demonstrationUrl ??
        null,

      newestCheckpoint:
        Math.max(
          Number(
            item.newestCheckpoint ??
            0
          ),
          Number(
            previous?.newestCheckpoint ??
            0
          )
        ),

      provenance: {
        ...(previous?.provenance ?? {}),
        ...(item.provenance ?? {})
      }
    }
  );
}


const items =
  [...merged.values()]
    .map(
      item => ({
        ...item,

        lifecycleState:
          normaliseLifecycle(
            item.lifecycleState
          )
      })
    )
    .sort(
      (a,b) => {

        const order = {
          Product:
            0,

          Application:
            1,

          Utility:
            2
        };

        return (
          (order[a.category] ?? 99) -
            (order[b.category] ?? 99) ||
          String(
            a.displayName
          ).localeCompare(
            String(
              b.displayName
            ),
            "en-GB"
          )
        );
      }
    );


if (!items.length) {
  throw new Error(
    "Catalogue contains no portfolio items."
  );
}


function card(item) {

  const lifecycle =
    normaliseLifecycle(
      item.lifecycleState
    );

  const statusClass =
    "status-" +
    lifecycle
      .toLowerCase()
      .replaceAll(
        " ",
        "-"
      );

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
      data-newest="${esc(
        item.newestCheckpoint
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
          ${esc(
            lifecycleLabel(
              lifecycle
            )
          )}
        </span>

      </div>

      <p class="product-type">
        ${esc(
          item.category
        )}
      </p>

      <h3>
        ${esc(
          item.displayName
        )}
      </h3>

      <p class="product-summary">
        ${esc(
          item.publicSummary
        )}
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

    <h1>
      Catalogue
    </h1>

    <p class="hero-statement">
      Products, applications and utilities from Orange Peel IT.
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
        What we're building.
      </h2>

    </div>

    <div
      class="sort-control"
      aria-label="Sort portfolio"
    >

      <label for="catalogue-sort">
        Sort
      </label>

      <select id="catalogue-sort">

        <option value="type">
          Type
        </option>

        <option value="az">
          A-Z
        </option>

        <option value="newest">
          Newest
        </option>

      </select>

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
      BUILT ON
      <a
        href="https://apex.orangepeelit.co.uk"
      >
        APEX
      </a>
    </p>

    <p class="build-meta">
      Version ${esc(
        versionId
      )}
      ·
      Last updated ${esc(
        lastUpdated
      )}
    </p>

  </div>

</footer>


<script>
(() => {

  const grid =
    document.getElementById(
      "product-grid"
    );

  const select =
    document.getElementById(
      "catalogue-sort"
    );

  const categoryOrder = {
    Product:
      0,

    Application:
      1,

    Utility:
      2
  };


  const cards = () =>
    Array.from(
      grid.querySelectorAll(
        "[data-product-card]"
      )
    );


  function compare(mode) {

    return (a,b) => {

      if (mode === "az") {

        return (
          a.dataset.name.localeCompare(
            b.dataset.name,
            "en-GB"
          )
        );
      }


      if (mode === "newest") {

        return (
          Number(
            b.dataset.newest
          ) -
          Number(
            a.dataset.newest
          ) ||
          a.dataset.name.localeCompare(
            b.dataset.name,
            "en-GB"
          )
        );
      }


      return (
        (
          categoryOrder[
            a.dataset.type
          ] ?? 99
        ) -
        (
          categoryOrder[
            b.dataset.type
          ] ?? 99
        ) ||
        a.dataset.name.localeCompare(
          b.dataset.name,
          "en-GB"
        )
      );
    };
  }


  select.addEventListener(
    "change",
    () => {

      cards()
        .sort(
          compare(
            select.value
          )
        )
        .forEach(
          card =>
            grid.appendChild(
              card
            )
        );
    }
  );

})();
</script>

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
    52vh;

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
    88px 0;
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
    800px;

  margin:
    42px 0 0;

  color:
    var(--navy);

  font-size:
    clamp(
      27px,
      4vw,
      46px
    );

  line-height:
    1.14;
}

.portfolio {
  padding:
    100px 0;
}

.section-heading {
  display:
    flex;

  align-items:
    flex-end;

  justify-content:
    space-between;

  gap:
    32px;
}

.sort-control {
  display:
    flex;

  align-items:
    center;

  gap:
    10px;

  color:
    var(--muted);

  font-size:
    14px;
}

.sort-control select {
  min-width:
    130px;

  padding:
    9px 34px 9px 12px;

  border:
    1px solid var(--line);

  border-radius:
    10px;

  background:
    var(--white);

  color:
    var(--navy);

  font:
    inherit;
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
    0 12px 32px
    rgba(7,26,43,.055);
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

  border-top:
    1px solid var(--line);

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
  text-align:
    right;
}

.built-label {
  margin:
    0;

  color:
    var(--orange-dark);

  font-size:
    11px;

  font-weight:
    700;

  letter-spacing:
    .14em;
}

.built-label a {
  text-decoration:
    none;
}

.build-meta {
  margin:
    7px 0 0;

  color:
    var(--muted);

  font-size:
    12px;
}

@media (max-width:880px) {

  .product-grid {
    grid-template-columns:
      1fr 1fr;
  }

  .section-heading {
    align-items:
      flex-start;

    flex-direction:
      column;
  }
}

@media (max-width:600px) {

  .product-grid {
    grid-template-columns:
      1fr;
  }

  .site-footer {
    flex-direction:
      column;
  }

  .built-on-apex {
    text-align:
      left;
  }
}
`.trim() + "\n";


const manifest = {
  format:
    "ORANGEPEELIT_CATALOGUE_HOSTED_PROJECTION_V3",

  generatedFrom:
    "hosted-apex-core",

  checkpoint:
    head.checkpoint,

  transactionHash:
    head.transactionHash,

  versionId:
    versionId,

  lastUpdated:
    generatedAt.toISOString(),

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

        demonstrationUrl:
          item.demonstrationUrl,

        newestCheckpoint:
          item.newestCheckpoint,

        sourceModel:
          item.sourceModel
      })
    )
};


const traceability = {
  format:
    "ORANGEPEELIT_CATALOGUE_HOSTED_TRACEABILITY_V3",

  checkpoint:
    head.checkpoint,

  transactionHash:
    head.transactionHash,

  versionId:
    versionId,

  lastUpdated:
    generatedAt.toISOString(),

  portfolio:
    Object.fromEntries(
      items.map(
        item => [
          item.id,
          {
            lifecycleState:
              item.lifecycleState,

            newestCheckpoint:
              item.newestCheckpoint,

            sourceModel:
              item.sourceModel,

            provenance:
              item.provenance
          }
        ]
      )
    )
};


fs.mkdirSync(
  output,
  {
    recursive:
      true
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

      versionId:
        versionId,

      lastUpdated:
        generatedAt.toISOString(),

      portfolioEntries:
        items.length,

      lifecycleCounts:
        items.reduce(
          (result,item) => {

            const key =
              item.lifecycleState;

            result[key] =
              (result[key] ?? 0) + 1;

            return result;
          },
          {}
        )
    },
    null,
    2
  )
);
