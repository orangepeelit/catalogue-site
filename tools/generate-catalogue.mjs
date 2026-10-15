import fs from "node:fs";
import path from "node:path";

const transactionsFile = process.argv[2];
const manifestFile = process.argv[3];
const output = process.argv[4];

if (!transactionsFile || !manifestFile || !output) {
  throw new Error(
    "Usage: generate-catalogue.mjs <transactions> <manifest> <output>"
  );
}

const transactions =
  JSON.parse(
    fs.readFileSync(transactionsFile, "utf8").replace(/^\uFEFF/, "")
  );

const manifest =
  JSON.parse(
    fs.readFileSync(manifestFile, "utf8").replace(/^\uFEFF/, "")
  );

if (transactions.length !== 11) {
  throw new Error(
    `Expected 11 governed transactions; found ${transactions.length}`
  );
}

if (
  manifest.expected?.records !== 243 ||
  manifest.expected?.transactions !== 11 ||
  manifest.expected?.nodes !== 243 ||
  manifest.expected?.arcs !== 572
) {
  throw new Error(
    "Manifest does not describe governed baseline 243/11/243/572"
  );
}

/*
 * Materialise the current record identity set by replaying the
 * governed upsert history in transaction order.
 */
const current = new Map();

for (const envelope of transactions) {
  for (
    const operation of
    envelope?.transaction?.proposal?.operations ?? []
  ) {
    if (operation?.kind !== "collection.record.upsert") continue;

    const recordEnvelope = operation?.record;
    const value = recordEnvelope?.value;

    if (!value?.id) continue;

    current.set(value.id, {
      ...structuredClone(value),
      _transactionHash: envelope.transactionHash
    });
  }
}

/*
 * Portfolio membership is discovered from governed identity prefixes.
 * There is no separately maintained product list.
 */
const identityRules = [
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

const identities = [];

for (const record of current.values()) {
  if (record.kind !== "Entity") continue;

  const rule =
    identityRules.find(
      candidate => record.id.startsWith(candidate.prefix)
    );

  if (!rule) continue;

  identities.push({
    id: record.id,
    label: record.label,
    category: rule.category,
    transactionHash: record._transactionHash
  });
}

identities.sort(
  (a, b) =>
    String(a.label).localeCompare(
      String(b.label),
      "en-GB"
    )
);

const expectedPortfolioIds = [
  "org.orangepeelit.product.apex",
  "org.orangepeelit.application.workbench",
  "org.orangepeelit.utility.catalogue",
  "org.orangepeelit.utility.graph",
  "org.orangepeelit.application.demo",
  "org.orangepeelit.application.company"
].sort();

const actualPortfolioIds =
  identities.map(item => item.id).sort();

if (
  JSON.stringify(actualPortfolioIds) !==
  JSON.stringify(expectedPortfolioIds)
) {
  throw new Error(
    `Governed portfolio membership differs from expected current baseline:
${JSON.stringify(actualPortfolioIds, null, 2)}`
  );
}

function assertionsFor(subjectRef) {
  return [...current.values()]
    .filter(
      record =>
        record.kind === "Assertion" &&
        record.subjectRef === subjectRef
    )
    .sort(
      (a, b) =>
        String(a.id).localeCompare(
          String(b.id),
          "en-GB"
        )
    );
}

function literalValue(assertion) {
  return assertion?.literal?.value ?? null;
}

function claim(subjectRef, key) {
  return assertionsFor(subjectRef).find(
    assertion =>
      assertion?.literal?.key === key
  ) ?? null;
}

function demonstrability(subjectRef) {
  const candidates =
    assertionsFor(subjectRef).filter(
      assertion =>
        assertion?.literal?.key === "demonstrationStatus"
    );

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one demonstrability assertion for ${subjectRef}; found ${candidates.length}`
    );
  }

  return candidates[0];
}

function portfolioClaim(subjectRef) {
  const found =
    claim(subjectRef, "portfolio");

  if (!found) {
    throw new Error(
      `No governed portfolio claim for ${subjectRef}`
    );
  }

  return found;
}

const items =
  identities.map(identity => {
    const portfolioAssertion =
      portfolioClaim(identity.id);

    const portfolio =
      literalValue(portfolioAssertion);

    if (!portfolio?.purpose) {
      throw new Error(
        `Portfolio purpose absent for ${identity.id}`
      );
    }

    const demoAssertion =
      demonstrability(identity.id);

    const demo =
      literalValue(demoAssertion);

    if (!demo?.status) {
      throw new Error(
        `Demonstrability status absent for ${identity.id}`
      );
    }

    return {
      id: identity.id,
      label: identity.label,
      category: identity.category,

      purpose:
        portfolio.purpose,

      dependencies:
        Array.isArray(portfolio.dependencies)
          ? portfolio.dependencies
          : [],

      maturity:
        portfolio.maturity ?? null,

      qualification:
        portfolio.qualification ?? null,

      demonstrationStatus:
        demo.status,

      demonstrationUrl:
        demo.demonstrationUrl ?? null,

      demonstrationNotes:
        demo.demonstrationNotes ?? null,

      demonstrationEvidence:
        Array.isArray(demo.demonstrationEvidence)
          ? demo.demonstrationEvidence
          : [],

      traceability: {
        identityRecord:
          identity.id,

        identityTransaction:
          identity.transactionHash,

        portfolioAssertion:
          portfolioAssertion.id,

        portfolioTransaction:
          portfolioAssertion._transactionHash,

        demonstrabilityAssertion:
          demoAssertion.id,

        demonstrabilityTransaction:
          demoAssertion._transactionHash
      }
    };
  });

/*
 * Presentation knowledge.
 */
const builtOnApex =
  current.get(
    "org.orangepeelit.presentation.claim.built-on-apex-v1"
  );

const typography =
  current.get(
    "org.orangepeelit.presentation.claim.typography-v1"
  );

const colours =
  current.get(
    "org.orangepeelit.presentation.claim.colours-v1"
  );

if (!builtOnApex || !typography || !colours) {
  throw new Error(
    "Governed Presentation System records are incomplete"
  );
}

const typographyValue =
  literalValue(typography);

const coloursValue =
  literalValue(colours);

const builtOnApexValue =
  literalValue(builtOnApex);

const catalogue =
  items.find(
    item =>
      item.id === "org.orangepeelit.utility.catalogue"
  );

if (!catalogue) {
  throw new Error("Catalogue identity absent");
}

const esc = value =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const statusLabel = status => {
  switch (status) {
    case "LIVE":
      return "Live";
    case "DEMONSTRABLE":
      return "Demo available";
    case "INTERNAL_DEMO":
      return "Internal demo";
    case "NOT_DEMONSTRABLE":
      return "Not yet demonstrable";
    default:
      return status;
  }
};

const statusClass = status => {
  switch (status) {
    case "LIVE":
      return "status-live";
    case "DEMONSTRABLE":
      return "status-demo";
    case "INTERNAL_DEMO":
      return "status-internal";
    default:
      return "status-unavailable";
  }
};

function maturityMarkup(item) {
  if (!item.maturity || typeof item.maturity !== "object") {
    return `
      <p class="meta-line">
        <span>Maturity</span>
        <strong>Not governed</strong>
      </p>`;
  }

  const entries =
    Object.entries(item.maturity);

  if (!entries.length) {
    return `
      <p class="meta-line">
        <span>Maturity</span>
        <strong>Not governed</strong>
      </p>`;
  }

  return `
    <div class="maturity">
      <span class="meta-heading">Maturity</span>
      ${entries.map(([key, value]) => `
        <p class="meta-line">
          <span>${esc(key)}</span>
          <strong>${esc(value)}</strong>
        </p>
      `).join("")}
    </div>`;
}

function dependencyMarkup(item) {
  if (!item.dependencies.length) {
    return `
      <p class="meta-line">
        <span>Dependencies</span>
        <strong>None governed</strong>
      </p>`;
  }

  const labels =
    item.dependencies.map(id => {
      const target =
        items.find(candidate => candidate.id === id);

      return target?.label ?? id.split(".").at(-1);
    });

  return `
    <p class="meta-line">
      <span>Dependencies</span>
      <strong>${esc(labels.join(", "))}</strong>
    </p>`;
}

function cardMarkup(item) {
  const canOpen =
    item.demonstrationStatus === "LIVE" &&
    item.demonstrationUrl;

  return `
    <article class="product-card" id="${esc(item.id)}">
      <div class="card-top">
        <span class="category">${esc(item.category)}</span>
        <span class="status ${statusClass(item.demonstrationStatus)}">
          ${esc(statusLabel(item.demonstrationStatus))}
        </span>
      </div>

      <h2>${esc(item.label)}</h2>

      <p class="purpose">
        ${esc(item.purpose)}
      </p>

      <div class="card-details">
        ${dependencyMarkup(item)}
        ${maturityMarkup(item)}
      </div>

      ${
        canOpen
          ? `<a class="card-action" href="${esc(item.demonstrationUrl)}">
               View product <span aria-hidden="true">→</span>
             </a>`
          : `<span class="card-action card-action-disabled">
               No public demonstration yet
             </span>`
      }
    </article>`;
}

const cards =
  items
    .sort((a, b) => {
      const order = {
        Product: 0,
        Application: 1,
        Utility: 2
      };

      return (
        order[a.category] - order[b.category] ||
        a.label.localeCompare(b.label, "en-GB")
      );
    })
    .map(cardMarkup)
    .join("\n");

const builtVariant =
  builtOnApexValue?.apexVariant ?? {};

const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >

  <title>Catalogue | Orange Peel IT</title>

  <meta
    name="description"
    content="${esc(catalogue.purpose)}"
  >

  <link rel="icon" href="assets/favicon.ico">
  <link
    rel="icon"
    type="image/png"
    sizes="32x32"
    href="assets/favicon-32.png"
  >
  <link
    rel="apple-touch-icon"
    href="assets/apple-touch-icon.png"
  >

  <link rel="stylesheet" href="styles.css">
</head>

<body>
  <header class="site-header">
    <a
      class="brand"
      href="https://orangepeelit.co.uk"
      aria-label="Orange Peel IT"
    >
      <img
        src="assets/orange-peel-brand.png"
        alt="Orange Peel IT"
      >
    </a>

    <nav aria-label="Primary">
      <a href="#portfolio">Portfolio</a>
      <a href="#about">About</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <p class="eyebrow">ORANGE PEEL IT</p>

      <h1>Catalogue</h1>

      <p class="hero-copy">
        ${esc(catalogue.purpose)}
      </p>

      <p class="hero-support">
        The catalogue is generated from governed OrangePeelIT Core knowledge.
        Products become eligible through Core rather than being entered here separately.
      </p>
    </section>

    <section
      class="portfolio-section"
      id="portfolio"
      aria-labelledby="portfolio-title"
    >
      <div class="section-heading">
        <p class="eyebrow">PORTFOLIO</p>
        <h2 id="portfolio-title">What Orange Peel has built.</h2>
      </div>

      <div class="product-grid">
        ${cards}
      </div>
    </section>

    <section class="about" id="about">
      <div>
        <p class="eyebrow">HOW THIS WORKS</p>
        <h2>One governed portfolio.</h2>
      </div>

      <div class="about-copy">
        <p>
          Catalogue does not maintain its own authoritative product inventory.
          It projects identities, classifications, dependencies, maturity evidence
          and demonstrability from OrangePeelIT Core.
        </p>

        <p>
          Demonstrability is separate from maturity. A product can exist in the
          governed portfolio without pretending that a public demonstration is ready.
        </p>
      </div>
    </section>

    <section class="proof">
      <p class="eyebrow">GOVERNED SOURCE</p>

      <div class="proof-grid">
        <div>
          <strong>${manifest.expected.records}</strong>
          <span>semantic records</span>
        </div>

        <div>
          <strong>${manifest.expected.transactions}</strong>
          <span>governed transactions</span>
        </div>

        <div>
          <strong>${manifest.expected.nodes}</strong>
          <span>graph nodes</span>
        </div>

        <div>
          <strong>${manifest.expected.arcs}</strong>
          <span>graph edges</span>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="built-with-apex">
      <span>${esc(builtVariant.label ?? "BUILT WITH APEX")}</span>
      <p>
        ${esc(
          builtVariant.text ??
          "This site is built from governed knowledge held in APEX."
        )}
      </p>
    </div>

    <p class="copyright">
      © Orange Peel IT Services Ltd
    </p>
  </footer>
</body>
</html>
`;

const styles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700&display=swap');

:root {
  --orange: ${coloursValue.orange};
  --orange-dark: ${coloursValue.orangeDark};
  --orange-soft: ${coloursValue.orangeSoft};
  --navy: ${coloursValue.navy};
  --ink: #122536;
  --muted: #637180;
  --line: #dde3e8;
  --surface: #f7f8f9;
  --white: #ffffff;
  --radius: 24px;
  --radius-small: 14px;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: '${typographyValue.body}', sans-serif;
  color: var(--ink);
  background: var(--white);
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
}

.site-header {
  max-width: 1240px;
  margin: 0 auto;
  padding: 28px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand img {
  display: block;
  width: auto;
  height: 42px;
}

.site-header nav {
  display: flex;
  gap: 28px;
}

.site-header nav a {
  text-decoration: none;
  font-weight: 600;
  font-size: 0.93rem;
}

main {
  overflow: hidden;
}

.hero {
  max-width: 1240px;
  margin: 0 auto;
  padding: 96px 24px 110px;
}

.eyebrow {
  margin: 0 0 18px;
  color: var(--orange-dark);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
}

h1,
h2 {
  font-family: '${typographyValue.headings}', sans-serif;
  color: var(--navy);
  letter-spacing: -0.04em;
}

h1 {
  margin: 0;
  max-width: 900px;
  font-size: clamp(4rem, 10vw, 8.5rem);
  line-height: 0.92;
}

.hero-copy {
  max-width: 830px;
  margin: 42px 0 0;
  font-family: '${typographyValue.headings}', sans-serif;
  color: var(--navy);
  font-size: clamp(1.45rem, 3vw, 2.35rem);
  line-height: 1.25;
  letter-spacing: -0.025em;
}

.hero-support {
  max-width: 720px;
  margin: 24px 0 0;
  color: var(--muted);
  font-size: 1.08rem;
  line-height: 1.75;
}

.portfolio-section {
  padding: 90px 24px 110px;
  background: var(--surface);
}

.section-heading,
.product-grid,
.about,
.proof,
.site-footer {
  max-width: 1240px;
  margin-left: auto;
  margin-right: auto;
}

.section-heading {
  margin-bottom: 46px;
}

.section-heading h2,
.about h2 {
  margin: 0;
  font-size: clamp(2.6rem, 5vw, 4.8rem);
  line-height: 1;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.product-card {
  min-height: 440px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--white);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.category {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.status {
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
}

.status-live {
  color: #17633a;
  background: #e5f5eb;
}

.status-demo {
  color: #855000;
  background: #fff0d5;
}

.status-internal {
  color: #45516b;
  background: #eaedf5;
}

.status-unavailable {
  color: #67727d;
  background: #edf0f2;
}

.product-card h2 {
  margin: 38px 0 16px;
  font-size: clamp(2rem, 4vw, 3.15rem);
}

.purpose {
  margin: 0;
  max-width: 560px;
  color: var(--muted);
  font-size: 1.04rem;
  line-height: 1.65;
}

.card-details {
  margin: 36px 0 30px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}

.meta-heading {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.meta-line {
  margin: 8px 0;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  color: var(--muted);
  font-size: 0.88rem;
}

.meta-line strong {
  max-width: 65%;
  color: var(--ink);
  font-weight: 600;
  text-align: right;
}

.maturity {
  margin-top: 24px;
}

.card-action {
  margin-top: auto;
  width: fit-content;
  color: var(--navy);
  font-weight: 700;
  text-decoration: none;
}

.card-action:not(.card-action-disabled):hover {
  color: var(--orange-dark);
}

.card-action-disabled {
  color: #9099a1;
}

.about {
  padding: 110px 24px;
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 80px;
}

.about-copy p {
  margin: 0 0 24px;
  color: var(--muted);
  font-size: 1.14rem;
  line-height: 1.8;
}

.proof {
  margin-bottom: 100px;
  padding: 42px;
  border-radius: var(--radius);
  background: var(--navy);
}

.proof .eyebrow {
  color: var(--orange-soft);
}

.proof-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.proof-grid div {
  display: flex;
  flex-direction: column;
}

.proof-grid strong {
  font-family: '${typographyValue.headings}', sans-serif;
  color: var(--white);
  font-size: 2.6rem;
}

.proof-grid span {
  margin-top: 5px;
  color: #b9c5ce;
  font-size: 0.86rem;
}

.site-footer {
  margin-bottom: 34px;
  padding: 34px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: flex;
  justify-content: space-between;
  gap: 40px;
}

.built-with-apex span {
  display: block;
  margin-bottom: 8px;
  color: var(--orange-dark);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.built-with-apex p,
.copyright {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.built-with-apex p {
  max-width: 620px;
}

@media (max-width: 780px) {
  .site-header {
    padding-top: 20px;
  }

  .brand img {
    height: 34px;
  }

  .site-header nav {
    gap: 16px;
  }

  .hero {
    padding-top: 70px;
    padding-bottom: 80px;
  }

  .product-grid {
    grid-template-columns: 1fr;
  }

  .product-card {
    min-height: 0;
  }

  .about {
    grid-template-columns: 1fr;
    gap: 36px;
  }

  .proof {
    margin-left: 18px;
    margin-right: 18px;
  }

  .proof-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .site-footer {
    margin-left: 18px;
    margin-right: 18px;
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .site-header nav {
    display: none;
  }

  .hero {
    padding-left: 20px;
    padding-right: 20px;
  }

  .portfolio-section {
    padding-left: 18px;
    padding-right: 18px;
  }

  .product-card {
    padding: 24px;
  }

  .meta-line {
    display: block;
  }

  .meta-line strong {
    display: block;
    max-width: none;
    margin-top: 4px;
    text-align: left;
  }

  .proof-grid {
    grid-template-columns: 1fr 1fr;
  }
}
`.trim() + "\n";

const traceability = {
  format:
    "ORANGEPEELIT_CATALOGUE_TRACEABILITY_V1",

  generatedFrom: {
    core:
      "OrangePeelIT Core",

    records:
      manifest.expected.records,

    transactions:
      manifest.expected.transactions,

    graphNodes:
      manifest.expected.nodes,

    graphEdges:
      manifest.expected.arcs
  },

  portfolio:
    Object.fromEntries(
      items.map(item => [
        item.id,
        item.traceability
      ])
    ),

  presentation: {
    builtOnApex:
      builtOnApex.id,

    typography:
      typography.id,

    colours:
      colours.id
  }
};

const projectionManifest = {
  format:
    "ORANGEPEELIT_CATALOGUE_PROJECTION_V1",

  generated:
    true,

  authority:
    "OrangePeelIT Core",

  portfolioEntries:
    items.length,

  coreBaseline: {
    records:
      manifest.expected.records,

    transactions:
      manifest.expected.transactions,

    graphNodes:
      manifest.expected.nodes,

    graphEdges:
      manifest.expected.arcs
  },

  rules: {
    duplicateManualInventory:
      false,

    demonstrabilitySeparateFromMaturity:
      true,

    traceabilityRequired:
      true
  },

  publicItems:
    items.map(item => ({
      id:
        item.id,

      label:
        item.label,

      category:
        item.category,

      demonstrationStatus:
        item.demonstrationStatus,

      demonstrationUrl:
        item.demonstrationUrl
    }))
};

fs.writeFileSync(
  path.join(output, "index.html"),
  html,
  "utf8"
);

fs.writeFileSync(
  path.join(output, "styles.css"),
  styles,
  "utf8"
);

fs.writeFileSync(
  path.join(output, "traceability.json"),
  JSON.stringify(traceability, null, 2) + "\n",
  "utf8"
);

fs.writeFileSync(
  path.join(output, "projection-manifest.json"),
  JSON.stringify(projectionManifest, null, 2) + "\n",
  "utf8"
);

/*
 * Qualification.
 */
if (items.length !== 6) {
  throw new Error(
    `Expected six governed portfolio entries; found ${items.length}`
  );
}

const live =
  items.filter(
    item => item.demonstrationStatus === "LIVE"
  );

if (
  live.length !== 1 ||
  live[0].id !== "org.orangepeelit.product.apex"
) {
  throw new Error(
    "Expected APEX to be the single governed LIVE entry"
  );
}

for (const item of items) {
  if (!item.traceability.identityRecord) {
    throw new Error(
      `Traceability absent for ${item.id}`
    );
  }
}

console.log(
  JSON.stringify({
    status:
      "GENERATED",

    portfolioEntries:
      items.length,

    categories:
      Object.fromEntries(
        ["Product", "Application", "Utility"]
          .map(category => [
            category,
            items.filter(
              item => item.category === category
            ).length
          ])
      ),

    demonstrability:
      Object.fromEntries(
        items.map(
          item => [
            item.label,
            item.demonstrationStatus
          ]
        )
      ),

    coreBaseline:
      projectionManifest.coreBaseline,

    traceabilityEntries:
      Object.keys(
        traceability.portfolio
      ).length
  }, null, 2)
);
