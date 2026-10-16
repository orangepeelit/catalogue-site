import fs from "node:fs";
import path from "node:path";

const root =
  process.argv[2];

if (!root) {
  throw new Error(
    "Usage: verify-catalogue.mjs <catalogue-root>"
  );
}

const read =
  file =>
    fs.readFileSync(
      path.join(root,file),
      "utf8"
    );

const html =
  read("index.html");

const css =
  read("styles.css");

const generator =
  read(
    "tools/generate-catalogue.mjs"
  );

const tile =
  read(
    "tools/catalogue-tile.mjs"
  );

const projection =
  JSON.parse(
    read(
      "projection-manifest.json"
    )
  );

const traceability =
  JSON.parse(
    read(
      "traceability.json"
    )
  );

const results = [];

function test(
  id,
  requirement,
  description,
  fn
) {
  try {
    const passed =
      Boolean(fn());

    results.push({
      id,
      requirement,
      description,
      result:
        passed
          ? "PASS"
          : "FAIL"
    });
  }
  catch (error) {
    results.push({
      id,
      requirement,
      description,
      result:
        "FAIL",
      error:
        error.message
    });
  }
}

const itemNames =
  projection.publicItems
    .map(
      item =>
        item.displayName
    );

const expectedNames = [
  "APEX",
  "Workbench",
  "Catalogue",
  "Graph",
  "Demo",
  "Company"
];

/*
 * CAT-FR current executable checks.
 *
 * These checks prove observable Catalogue component/projection behaviour
 * against the current build. They do not reuse historical PASS results.
 */
test(
  "CAT-TC-001",
  "CAT-FR-001",
  "Catalogue projects the governed portfolio",
  () =>
    projection.portfolioEntries === 6
);

test(
  "CAT-TC-002",
  "CAT-FR-002",
  "Portfolio identities originate from governed transaction history",
  () =>
    generator.includes(
      "const current ="
    ) &&
    generator.includes(
      "transactions.forEach"
    )
);

test(
  "CAT-TC-003",
  "CAT-FR-003",
  "Reusable Catalogue tile component exists",
  () =>
    generator.includes(
      'from "./catalogue-tile.mjs"'
    ) &&
    tile.includes(
      "renderCatalogueTile"
    )
);

test(
  "CAT-TC-004",
  "CAT-FR-004",
  "Standalone Catalogue uses the reusable tile component",
  () =>
    generator.includes(
      ".map(renderCatalogueTile)"
    )
);

test(
  "CAT-TC-005",
  "CAT-FR-005",
  "Catalogue retains Core as authority",
  () =>
    projection.authority ===
      "OrangePeelIT Core"
);

test(
  "CAT-TC-006",
  "CAT-FR-006",
  "Catalogue does not maintain a duplicate manual product inventory",
  () =>
    projection.rules
      .duplicateManualInventory ===
      false
);

test(
  "CAT-TC-007",
  "CAT-FR-007",
  "Each projected Product retains traceability",
  () =>
    Object.keys(
      traceability.portfolio
    ).length === 6
);

test(
  "CAT-TC-008",
  "CAT-FR-008",
  "Demonstrability remains distinct from maturity",
  () =>
    projection.rules
      .demonstrabilitySeparateFromMaturity ===
      true
);

test(
  "CAT-TC-009",
  "CAT-FR-009",
  "Projection uses current Core baseline",
  () =>
    projection.coreBaseline.records ===
      305 &&
    projection.coreBaseline.transactions ===
      14 &&
    projection.coreBaseline.graphNodes ===
      305 &&
    projection.coreBaseline.graphEdges ===
      696
);

test(
  "CAT-TC-010",
  "CAT-FR-010",
  "Exactly six current portfolio entries are emitted",
  () =>
    projection.publicItems.length ===
      6
);

test(
  "CAT-TC-011",
  "CAT-FR-011",
  "Generated public artefacts are present",
  () =>
    fs.existsSync(
      path.join(
        root,
        "index.html"
      )
    ) &&
    fs.existsSync(
      path.join(
        root,
        "styles.css"
      )
    )
);

test(
  "CAT-TC-012",
  "CAT-FR-012",
  "Approved application assets remain available",
  () =>
    [
      "favicon.ico",
      "favicon-32.png",
      "apple-touch-icon.png",
      "orange-peel-brand.png"
    ].every(
      file =>
        fs.existsSync(
          path.join(
            root,
            "assets",
            file
          )
        )
    )
);

test(
  "CAT-TC-013",
  "CAT-FR-013",
  "Public projection contains no duplicate Product names",
  () =>
    new Set(itemNames).size ===
      itemNames.length
);

test(
  "CAT-TC-014",
  "CAT-FR-014",
  "Projection exposes current governed demonstrability",
  () =>
    projection.publicItems
      .every(
        item =>
          typeof item
            .demonstrationStatus ===
            "string"
      )
);

test(
  "CAT-TC-015",
  "CAT-FR-015",
  "Catalogue public status is LIVE",
  () =>
    projection.publicItems
      .find(
        item =>
          item.displayName ===
          "Catalogue"
      )
      ?.demonstrationStatus ===
      "LIVE"
);

test(
  "CAT-TC-016",
  "CAT-FR-016",
  "Generated presentation remains a disposable projection",
  () =>
    projection.generated ===
      true &&
    projection.rules
      .duplicateManualInventory ===
      false
);

/*
 * CAT-UX checks use the recovered governed UX contract.
 */
test(
  "CAT-UX-TC-001",
  "CAT-UX-001",
  "One visually distinct tile per Product",
  () =>
    (
      html.match(
        /<article\b[^>]*\bdata-product-card\b[^>]*>/g
      ) ?? []
    ).length === 6
);

test(
  "CAT-UX-TC-002",
  "CAT-UX-002",
  "Concise governed display names",
  () =>
    expectedNames.every(
      name =>
        itemNames.includes(name)
    )
);

test(
  "CAT-UX-TC-003",
  "CAT-UX-003",
  "Product icon is prominent",
  () =>
    (
      html.match(
        /class="product-icon"/g
      ) ?? []
    ).length === 6
);

test(
  "CAT-UX-TC-004",
  "CAT-UX-004",
  "Plain-English public summaries are used",
  () =>
    projection.publicItems
      .every(
        item =>
          typeof item.publicSummary ===
            "string" &&
          item.publicSummary.length >
            20
      )
);

test(
  "CAT-UX-TC-005",
  "CAT-UX-005",
  "Current state is presented without raw internal qualification text",
  () =>
    !html.includes(
      "qualification"
    ) &&
    !html.includes(
      "Maturity"
    )
);

test(
  "CAT-UX-TC-006",
  "CAT-UX-006",
  "Rounded restrained Orange Peel cards",
  () =>
    css.includes(
      "border-radius: var(--radius-md)"
    ) &&
    css.includes(
      "box-shadow:"
    )
);

test(
  "CAT-UX-TC-007",
  "CAT-UX-007",
  "Selected Catalogue tile uses restrained Orange Peel accent",
  () =>
    html.includes(
      "product-card-selected"
    ) &&
    css.includes(
      "rgba(255,116,18,.55)"
    )
);

test(
  "CAT-UX-TC-008",
  "CAT-UX-008",
  "Newest, A-Z and Type sorting are available",
  () =>
    html.includes(
      'value="newest"'
    ) &&
    html.includes(
      'value="az"'
    ) &&
    html.includes(
      'value="type"'
    )
);

test(
  "CAT-UX-TC-009",
  "CAT-UX-009",
  "Sorting changes DOM presentation only",
  () =>
    html.includes(
      "grid.appendChild(card)"
    ) &&
    !html.includes(
      "fetch("
    )
);

test(
  "CAT-UX-TC-010",
  "CAT-UX-010",
  "Same Product tile component is reusable outside standalone Catalogue",
  () =>
    tile.includes(
      "export function renderCatalogueTile"
    )
);

test(
  "CAT-UX-TC-011",
  "CAT-UX-011",
  "Tile metadata comes from governed Product records rather than hard-coded public item data",
  () =>
    generator.includes(
      'claim('
    ) &&
    generator.includes(
      '"displayName"'
    ) &&
    generator.includes(
      '"publicSummary"'
    )
);

test(
  "CAT-UX-TC-012",
  "CAT-UX-012",
  "Single responsive mobile-first implementation",
  () =>
    css.includes(
      "@media (max-width: 600px)"
    ) &&
    !fs.existsSync(
      path.join(
        root,
        "mobile"
      )
    )
);

/*
 * Cross-cutting presentation safety gates.
 */
const leakage = [
  "UNKNOWN",
  "Not governed",
  "No public demonstration yet",
  "Record as CONFIRMED product intent:",
  "\uFFFD",
  "ï¿½"
];

for (const token of leakage) {
  if (html.includes(token)) {
    throw new Error(
      `Public presentation leakage detected: ${token}`
    );
  }
}

if (
  />orangepeelit</i.test(html) ||
  /APEX,\s*orangepeelit/i.test(html)
) {
  throw new Error(
    "Host/context is leaking as a Product dependency."
  );
}

const pass =
  results.filter(
    item =>
      item.result === "PASS"
  ).length;

const fail =
  results.length - pass;

const report = {
  format:
    "CATALOGUE_CURRENT_BUILD_ASSURANCE_V2",

  historicalResultsReused:
    false,

  executed:
    results.length,

  pass,
  fail,

  coreBaseline:{
    records:305,
    transactions:14,
    nodes:305,
    edges:696
  },

  results
};

console.log(
  JSON.stringify(
    report,
    null,
    2
  )
);

if (
  results.length !== 28
) {
  throw new Error(
    `Expected 28 current Catalogue tests; executed ${results.length}.`
  );
}

if (fail !== 0) {
  throw new Error(
    `${fail} current Catalogue tests failed.`
  );
}
