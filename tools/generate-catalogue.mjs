import fs from "node:fs";
import path from "node:path";

import {
  escapeHtml,
  renderCatalogueTile
} from "./catalogue-tile.mjs";

const transactionsFile =
  process.argv[2];

const manifestFile =
  process.argv[3];

const output =
  process.argv[4];

if (
  !transactionsFile ||
  !manifestFile ||
  !output
) {
  throw new Error(
    "Usage: generate-catalogue.mjs <transactions> <manifest> <output>"
  );
}

const transactions =
  JSON.parse(
    fs
      .readFileSync(
        transactionsFile,
        "utf8"
      )
      .replace(/^\uFEFF/,"")
  );

const manifest =
  JSON.parse(
    fs
      .readFileSync(
        manifestFile,
        "utf8"
      )
      .replace(/^\uFEFF/,"")
  );

/*
 * Never duplicate current Core counts in source.
 * Manifest is the qualification contract.
 */
if (
  transactions.length !==
  manifest.expected?.transactions
) {
  throw new Error(
    `Transaction history (${transactions.length}) does not match manifest (${manifest.expected?.transactions}).`
  );
}

if (
  !Number.isInteger(manifest.expected?.records) ||
  !Number.isInteger(manifest.expected?.transactions) ||
  !Number.isInteger(manifest.expected?.nodes) ||
  !Number.isInteger(manifest.expected?.arcs)
) {
  throw new Error(
    "Catalogue corrective build requires promoted Core baseline 305/14/305/696."
  );
}

/*
 * Replay governed current-record identity.
 */
const current =
  new Map();

const lastTouched =
  new Map();

transactions.forEach(
  (envelope,transactionIndex) => {
    for (
      const operation of
      envelope?.transaction?.proposal?.operations ?? []
    ) {
      if (
        operation?.kind !==
        "collection.record.upsert"
      ) {
        continue;
      }

      const value =
        operation?.record?.value;

      if (!value?.id) {
        continue;
      }

      current.set(
        value.id,
        {
          ...structuredClone(value),
          _transactionHash:
            envelope.transactionHash,
          _transactionIndex:
            transactionIndex
        }
      );

      if (value.subjectRef) {
        lastTouched.set(
          value.subjectRef,
          Math.max(
            lastTouched.get(value.subjectRef) ?? -1,
            transactionIndex
          )
        );
      }

      lastTouched.set(
        value.id,
        Math.max(
          lastTouched.get(value.id) ?? -1,
          transactionIndex
        )
      );
    }
  }
);

const identityRules = [
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

const expectedPortfolioIds = [
  "org.orangepeelit.product.apex",
  "org.orangepeelit.application.workbench",
  "org.orangepeelit.utility.catalogue",
  "org.orangepeelit.utility.graph",
  "org.orangepeelit.application.demo",
  "org.orangepeelit.application.company"
];

const identities =
  [...current.values()]
    .filter(
      record =>
        record.kind === "Entity" &&
        identityRules.some(
          rule =>
            record.id.startsWith(
              rule.prefix
            )
        )
    )
    .filter(
      record =>
        expectedPortfolioIds.includes(
          record.id
        )
    );

if (identities.length !== 6) {
  throw new Error(
    `Expected six governed portfolio identities; found ${identities.length}.`
  );
}

function categoryFor(id) {
  const rule =
    identityRules.find(
      candidate =>
        id.startsWith(
          candidate.prefix
        )
    );

  if (!rule) {
    throw new Error(
      `No governed Catalogue category for ${id}`
    );
  }

  return rule.category;
}

function assertionsFor(subjectRef) {
  return [...current.values()]
    .filter(
      record =>
        record.kind === "Assertion" &&
        record.subjectRef ===
          subjectRef
    );
}

function claim(subjectRef,key) {
  const matches =
    assertionsFor(subjectRef)
      .filter(
        record =>
          record?.literal?.key === key
      );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one current ${key} assertion for ${subjectRef}; found ${matches.length}.`
    );
  }

  return matches[0];
}

function optionalClaim(subjectRef,key) {
  const matches =
    assertionsFor(subjectRef)
      .filter(
        record =>
          record?.literal?.key === key
      );

  if (matches.length > 1) {
    throw new Error(
      `Multiple current ${key} assertions for ${subjectRef}.`
    );
  }

  return matches[0] ?? null;
}

function literal(assertion) {
  return assertion?.literal?.value ?? null;
}

/*
 * Presentation system facts.
 */
const typography =
  current.get(
    "org.orangepeelit.presentation.claim.typography-v1"
  );

const colours =
  current.get(
    "org.orangepeelit.presentation.claim.colours-v1"
  );

const builtOnApex =
  current.get(
    "org.orangepeelit.presentation.claim.built-on-apex-v1"
  );

if (
  !typography ||
  !colours ||
  !builtOnApex
) {
  throw new Error(
    "Governed Orange Peel Presentation System is incomplete."
  );
}

const typographyValue =
  literal(typography);

const coloursValue =
  literal(colours);

const builtOnApexValue =
  literal(builtOnApex);

const iconFallback =
  claim(
    "org.orangepeelit.presentation.system.v1",
    "applicationIconFallback"
  );

if (
  typeof literal(iconFallback) !==
  "string"
) {
  throw new Error(
    "Governed shared application-icon fallback rule absent."
  );
}

/*
 * Product-specific icons are not currently governed.
 * The authorised fallback therefore resolves to the approved shared
 * Orange Peel application icon already held by this projection.
 */
const sharedIcon =
  "assets/favicon-32.png";

const items =
  identities.map(
    identity => {
      const displayNameAssertion =
        claim(
          identity.id,
          "displayName"
        );

      const summaryAssertion =
        claim(
          identity.id,
          "publicSummary"
        );

      const demoAssertion =
        claim(
          identity.id,
          "demonstrationStatus"
        );

      const displayName =
        literal(
          displayNameAssertion
        );

      const publicSummary =
        literal(
          summaryAssertion
        );

      const demonstration =
        literal(
          demoAssertion
        );

      if (
        typeof displayName !==
          "string" ||
        !displayName.trim()
      ) {
        throw new Error(
          `Governed displayName absent for ${identity.id}`
        );
      }

      if (
        typeof publicSummary !==
          "string" ||
        !publicSummary.trim()
      ) {
        throw new Error(
          `Governed publicSummary absent for ${identity.id}`
        );
      }

      if (
        !demonstration ||
        typeof demonstration.status !==
          "string"
      ) {
        throw new Error(
          `Governed demonstrability absent for ${identity.id}`
        );
      }

      const touchCandidates = [
        identity._transactionIndex,
        displayNameAssertion._transactionIndex,
        summaryAssertion._transactionIndex,
        demoAssertion._transactionIndex,
        lastTouched.get(identity.id)
      ].filter(Number.isFinite);

      return {
        id:
          identity.id,

        category:
          categoryFor(identity.id),

        displayName,

        publicSummary,

        icon:
          sharedIcon,

        iconSource:
          "governed-shared-application-fallback",

        demonstrationStatus:
          demonstration.status,

        demonstrationUrl:
          demonstration.demonstrationUrl ??
          null,

        newest:
          Math.max(
            ...touchCandidates
          ),

        selected:
          identity.id ===
          "org.orangepeelit.utility.catalogue",

        traceability:{
          identityRecord:
            identity.id,

          identityTransaction:
            identity._transactionHash,

          displayNameAssertion:
            displayNameAssertion.id,

          displayNameTransaction:
            displayNameAssertion._transactionHash,

          publicSummaryAssertion:
            summaryAssertion.id,

          publicSummaryTransaction:
            summaryAssertion._transactionHash,

          demonstrabilityAssertion:
            demoAssertion.id,

          demonstrabilityTransaction:
            demoAssertion._transactionHash
        }
      };
    }
  );

/*
 * No Product dependency is shown unless a specific current governed
 * Product-dependency presentation assertion exists.
 *
 * Historical portfolio dependencies are retained in Core but are not
 * silently reinterpreted as current public Product dependencies.
 */
for (const item of items) {
  const dependency =
    optionalClaim(
      item.id,
      "productDependency"
    );

  if (dependency) {
    item.productDependencies =
      literal(dependency);
  }
  else {
    item.productDependencies = [];
  }
}

const forbiddenDependency =
  items.some(
    item =>
      item.productDependencies
        .some(
          dependency =>
            String(dependency)
              .toLowerCase()
              .includes(
                "orangepeelit"
              )
        )
  );

if (forbiddenDependency) {
  throw new Error(
    "Host/context OrangePeelIT cannot be projected as a Product dependency."
  );
}

/*
 * Default presentation order: type then A-Z.
 * Client-side sorting changes DOM presentation only.
 */
const categoryOrder = {
  Product:0,
  Application:1,
  Utility:2
};

items.sort(
  (a,b) =>
    categoryOrder[a.category] -
      categoryOrder[b.category] ||
    a.displayName.localeCompare(
      b.displayName,
      "en-GB"
    )
);

const cards =
  items
    .map(renderCatalogueTile)
    .join("\n");

const catalogue =
  items.find(
    item =>
      item.id ===
      "org.orangepeelit.utility.catalogue"
  );

if (!catalogue) {
  throw new Error(
    "Catalogue identity absent."
  );
}

const esc =
  escapeHtml;

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
    content="${esc(catalogue.publicSummary)}"
  >

  <meta
    name="theme-color"
    content="${esc(coloursValue.navy)}"
  >

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
    rel="icon"
    href="assets/favicon.ico"
    sizes="any"
  >

  <link
    rel="icon"
    type="image/png"
    href="assets/favicon-32.png"
    sizes="32x32"
  >

  <link
    rel="apple-touch-icon"
    href="assets/apple-touch-icon.png"
  >

  <link
    rel="stylesheet"
    href="styles.css"
  >
</head>

<body>

<a
  class="skip-link"
  href="#main"
>
  Skip to content
</a>

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
    <a href="#proof">Proof</a>
  </nav>

</header>

<main id="main">

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
        ${esc(catalogue.publicSummary)}
      </p>

      <p class="hero-support">
        One governed portfolio, presented simply.
        Product knowledge remains in APEX; Catalogue is the view.
      </p>

      <div class="hero-actions">
        <a
          class="button primary"
          href="#portfolio"
        >
          Explore the portfolio
        </a>

        <a
          class="button secondary"
          href="#about"
        >
          How Catalogue works
        </a>
      </div>

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
      ${cards}
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
        One governed source. A simple public view.
      </h2>
    </div>

    <div class="about-copy">

      <p>
        Catalogue does not maintain a second product inventory.
        It projects the current portfolio from governed Orange Peel knowledge.
      </p>

      <p>
        Public presentation is deliberately smaller than the knowledge underneath it.
        Internal identifiers, incomplete engineering notes and unresolved implementation detail remain available for assurance without leaking into the normal interface.
      </p>

    </div>
  </section>

  <section
    class="proof"
    id="proof"
  >

    <div class="proof-copy">
      <p class="section-label">
        WHAT IS PROVEN
      </p>

      <h2>
        A portfolio we can reproduce.
      </h2>

      <p>
        This Catalogue is generated from the current governed OrangePeelIT Core baseline.
        Replaying the same governed transaction history inserts nothing new.
      </p>
    </div>

    <dl class="metrics">

      <div>
        <dt>Governed records</dt>
        <dd>${manifest.expected.records}</dd>
      </div>

      <div>
        <dt>Transactions</dt>
        <dd>${manifest.expected.transactions}</dd>
      </div>

      <div>
        <dt>Graph nodes</dt>
        <dd>${manifest.expected.nodes}</dd>
      </div>

      <div>
        <dt>Reference arcs</dt>
        <dd>${manifest.expected.arcs}</dd>
      </div>

      <div>
        <dt>Replay insertions</dt>
        <dd>0</dd>
      </div>

    </dl>

  </section>

</main>

<footer>

  <div class="footer-brand">

    <img
      src="assets/orange-peel-brand.png"
      alt="Orange Peel IT"
    >

    <div>
      <strong>Catalogue</strong>
      <p>
        Orange Peel IT Services Ltd
      </p>
    </div>

  </div>

  <div class="built-on-apex">

    <div>
      <p class="built-label">
        ${esc(
          builtVariant.label ??
          "BUILT WITH APEX"
        )}
      </p>

      <p>
        ${esc(
          builtVariant.text ??
          "This site is built from the governed knowledge, decisions and evidence held in APEX."
        )}
      </p>
    </div>

    <a href="#about">
      See how
    </a>

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
    Product: 0,
    Application: 1,
    Utility: 2
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
        return a.dataset.name
          .localeCompare(
            b.dataset.name,
            "en-GB"
          );
      }

      if (mode === "newest") {
        return (
          Number(b.dataset.newest) -
            Number(a.dataset.newest) ||
          a.dataset.name.localeCompare(
            b.dataset.name,
            "en-GB"
          )
        );
      }

      return (
        categoryOrder[a.dataset.type] -
          categoryOrder[b.dataset.type] ||
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
          compare(select.value)
        )
        .forEach(
          card =>
            grid.appendChild(card)
        );
    }
  );
})();
</script>

</body>
</html>`;

const styles = `
:root {
  --orange: ${coloursValue.orange};
  --orange-dark: ${coloursValue.orangeDark};
  --orange-soft: ${coloursValue.orangeSoft};
  --navy: ${coloursValue.navy};
  --paper: #f7f5f1;
  --white: #ffffff;
  --ink: #152534;
  --muted: #62707d;
  --line: rgba(7,26,43,.13);
  --radius-lg: 30px;
  --radius-md: 20px;
  --radius-sm: 12px;
  --max: 1240px;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: '${typographyValue.body}', system-ui, sans-serif;
  line-height: 1.55;
}

a {
  color: inherit;
}

.skip-link {
  position: absolute;
  left: -9999px;
}

.skip-link:focus {
  left: 18px;
  top: 18px;
  z-index: 100;
  background: white;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 0 max(24px, calc((100vw - var(--max)) / 2));
  background: rgba(247,245,241,.95);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--line);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  font-family: '${typographyValue.headings}', sans-serif;
}

.brand-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--orange);
}

nav {
  display: flex;
  align-items: center;
  gap: 26px;
  font-size: 14px;
}

nav a {
  text-decoration: none;
  color: var(--muted);
}

nav a:hover,
nav a:focus {
  color: var(--navy);
}

main section {
  width: min(var(--max), calc(100% - 48px));
  margin: 0 auto;
}

.hero {
  width: 100%;
  max-width: none;
  min-height: 72vh;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
}

.hero-inner {
  width: min(var(--max), calc(100% - 48px));
  margin: 0 auto;
  padding: 90px 0;
}

.eyebrow,
.section-label,
.product-type {
  margin: 0 0 16px;
  color: var(--orange-dark);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
}

h1,
h2,
h3 {
  color: var(--navy);
  font-family: '${typographyValue.headings}', sans-serif;
  letter-spacing: -.035em;
}

h1 {
  margin: 0;
  font-size: clamp(72px, 13vw, 156px);
  line-height: .84;
}

h2 {
  max-width: 900px;
  margin: 0;
  font-size: clamp(38px, 6vw, 68px);
  line-height: 1.02;
}

h3 {
  margin: 18px 0 12px;
  font-size: 30px;
  line-height: 1.05;
}

.hero-statement {
  max-width: 930px;
  margin: 46px 0 0;
  color: var(--navy);
  font-size: clamp(27px, 4vw, 47px);
  line-height: 1.14;
}

.hero-support {
  max-width: 760px;
  margin: 28px 0 0;
  color: var(--muted);
  font-size: 18px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 38px;
}

.button {
  display: inline-block;
  padding: 13px 18px;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 600;
}

.button.primary {
  background: var(--navy);
  color: white;
}

.button.secondary {
  border: 1px solid var(--line);
  background: white;
}

.portfolio,
.about,
.proof {
  padding: 100px 0;
  border-bottom: 1px solid var(--line);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 30px;
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 14px;
}

.sort-control select {
  appearance: none;
  min-width: 130px;
  padding: 10px 34px 10px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--white);
  color: var(--navy);
  font: inherit;
  font-weight: 600;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 18px;
  margin-top: 48px;
}

.product-card {
  min-height: 360px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px rgba(7,26,43,.055);
}

.product-card-selected {
  border-color: rgba(255,116,18,.55);
  box-shadow:
    0 0 0 3px rgba(255,116,18,.08),
    0 12px 32px rgba(7,26,43,.055);
}

.card-top {
  min-height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
}

.product-icon {
  display: block;
  width: 44px;
  height: 44px;
  border-radius: 10px;
}

.status {
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 12px;
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

.status-development {
  color: #67727d;
  background: #edf0f2;
}

.product-type {
  margin-top: 26px;
  margin-bottom: 0;
}

.product-summary {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.65;
}

.card-action {
  width: fit-content;
  margin-top: auto;
  padding-top: 30px;
  color: var(--navy);
  font-weight: 700;
  text-decoration: none;
}

.card-action:hover,
.card-action:focus {
  color: var(--orange-dark);
}

.about {
  display: grid;
  grid-template-columns: .9fr 1.1fr;
  gap: 80px;
}

.about-copy p {
  max-width: 720px;
  margin: 0 0 24px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.75;
}

.proof {
  display: grid;
  grid-template-columns: 1.25fr .75fr;
  gap: 60px;
  align-items: start;
}

.proof-copy p {
  max-width: 720px;
  font-size: 18px;
}

.metrics {
  margin: 0;
  padding: 30px;
  border-radius: var(--radius-lg);
  background: var(--navy);
  color: white;
}

.metrics div {
  display: flex;
  justify-content: space-between;
  gap: 30px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(255,255,255,.13);
}

.metrics div:last-child {
  border-bottom: 0;
}

.metrics dt {
  color: rgba(255,255,255,.68);
}

.metrics dd {
  margin: 0;
  font-family: '${typographyValue.headings}', sans-serif;
  font-weight: 700;
  font-size: 22px;
}

footer {
  width: min(var(--max), calc(100% - 48px));
  margin: 0 auto;
  padding: 46px 0 70px;
  display: flex;
  justify-content: space-between;
  gap: 30px;
  color: var(--muted);
  font-size: 14px;
}

footer p {
  margin: 4px 0;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.footer-brand img {
  display: block;
  width: auto;
  height: 42px;
  max-width: 150px;
  object-fit: contain;
}

.built-on-apex {
  max-width: 560px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 22px;
}

.built-on-apex p {
  margin: 0;
}

.built-label {
  margin-bottom: 5px !important;
  color: var(--orange-dark);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .14em;
}

.built-on-apex a {
  flex: 0 0 auto;
  color: var(--navy);
  font-weight: 600;
  text-decoration: none;
}

@media (max-width: 880px) {
  .site-header {
    padding: 0 20px;
  }

  nav {
    gap: 16px;
    overflow-x: auto;
  }

  .product-grid {
    grid-template-columns: 1fr 1fr;
  }

  .proof,
  .about {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .site-header {
    min-height: auto;
    padding-top: 14px;
    padding-bottom: 14px;
    align-items: flex-start;
    flex-direction: column;
  }

  nav {
    width: 100%;
    font-size: 13px;
  }

  .hero-inner {
    padding: 70px 0;
  }

  .portfolio,
  .about,
  .proof {
    padding: 70px 0;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .product-grid {
    grid-template-columns: 1fr;
  }

  footer {
    flex-direction: column;
  }

  .built-on-apex {
    justify-content: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .footer-brand img {
    height: 36px;
  }
}
`.trim() + "\n";

/*
 * Public projection manifest deliberately contains presentation-safe data.
 * Full provenance remains in traceability.json.
 */
const projectionManifest = {
  format:
    "ORANGEPEELIT_CATALOGUE_PROJECTION_V2",

  generated:
    true,

  authority:
    "OrangePeelIT Core",

  portfolioEntries:
    items.length,

  coreBaseline:{
    records:
      manifest.expected.records,

    transactions:
      manifest.expected.transactions,

    graphNodes:
      manifest.expected.nodes,

    graphEdges:
      manifest.expected.arcs
  },

  rules:{
    duplicateManualInventory:
      false,

    governedPresentationMetadata:
      true,

    sharedIconFallback:
      true,

    demonstrabilitySeparateFromMaturity:
      true,

    publicTechnicalLeakage:
      false,

    productDependencyRequiresExplicitGovernedPresentationFact:
      true,

    sortMutatesGovernedData:
      false
  },

  publicItems:
    items.map(
      item => ({
        displayName:
          item.displayName,

        category:
          item.category,

        publicSummary:
          item.publicSummary,

        demonstrationStatus:
          item.demonstrationStatus,

        demonstrationUrl:
          item.demonstrationUrl,

        icon:
          item.icon
      })
    )
};

const traceability = {
  format:
    "ORANGEPEELIT_CATALOGUE_TRACEABILITY_V2",

  sourceSnapshotRef:
    `org.orangepeelit.snapshot.${transactions.at(-1).transactionHash}`,

  generatedFrom:{
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
      items.map(
        item => [
          item.id,
          item.traceability
        ]
      )
    ),

  presentation:{
    builtOnApex:
      builtOnApex.id,

    typography:
      typography.id,

    colours:
      colours.id,

    applicationIconFallback:
      iconFallback.id
  }
};

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
    projectionManifest,
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

/*
 * Generator-level qualification.
 */
const exactNames = [
  "APEX",
  "Workbench",
  "Catalogue",
  "Graph",
  "Demo",
  "Company"
];

const actualNames =
  items
    .map(
      item => item.displayName
    )
    .sort();

if (
  JSON.stringify(
    actualNames
  ) !==
  JSON.stringify(
    [...exactNames].sort()
  )
) {
  throw new Error(
    `Governed display names are not the authorised six: ${JSON.stringify(actualNames)}`
  );
}

const summariesComplete =
  items.every(
    item =>
      typeof item.publicSummary ===
        "string" &&
      item.publicSummary.length > 20
  );

if (!summariesComplete) {
  throw new Error(
    "One or more governed public summaries is incomplete."
  );
}

const catalogueLive =
  catalogue.demonstrationStatus ===
    "LIVE";

if (!catalogueLive) {
  throw new Error(
    `Catalogue expected current governed LIVE state; found ${catalogue.demonstrationStatus}.`
  );
}

console.log(
  JSON.stringify(
    {
      status:
        "GENERATED",

      version:
        2,

      portfolioEntries:
        items.length,

      names:
        items.map(
          item =>
            item.displayName
        ),

      catalogueStatus:
        catalogue.demonstrationStatus,

      coreBaseline:
        projectionManifest.coreBaseline
    },
    null,
    2
  )
);
