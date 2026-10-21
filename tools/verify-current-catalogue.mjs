import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];

if (!root) {
  throw new Error("Usage: verify-current-catalogue.mjs <catalogue-root>");
}

function read(file) {
  return fs.readFileSync(
    path.join(root, file),
    "utf8"
  );
}

const html = read("index.html");
const projection = JSON.parse(
  read("projection-manifest.json")
);
const traceability = JSON.parse(
  read("traceability.json")
);

const items = Array.isArray(
  projection?.publicItems
)
  ? projection.publicItems
  : [];

const failures = [];

function require(condition, message) {
  if (!condition) failures.push(message);
}

require(
  projection?.generatedFrom === "hosted-apex-core",
  "Projection must identify hosted APEX Core as its source."
);

require(
  Number(projection?.checkpoint) > 0,
  "Projection must contain a Core checkpoint."
);

require(
  typeof projection?.transactionHash === "string" &&
  projection.transactionHash.length > 0,
  "Projection must contain a Core transaction hash."
);

require(
  items.length === Number(projection?.portfolioEntries),
  "portfolioEntries must equal publicItems length."
);

const ids = items.map(item => item.id);
const names = items.map(item => item.displayName);

require(
  new Set(ids).size === ids.length,
  "Catalogue contains duplicate portfolio IDs."
);

require(
  new Set(
    names.map(name => String(name).toLowerCase())
  ).size === names.length,
  "Catalogue contains duplicate portfolio display names."
);

const allowedLifecycle = new Set([
  "BACKLOG",
  "PRIORITISED",
  "IN BUILD",
  "DEPLOYED"
]);

for (const item of items) {
  require(
    allowedLifecycle.has(item.lifecycleState),
    `Invalid lifecycle for ${item.id}: ${item.lifecycleState}`
  );

  require(
    traceability?.portfolio?.[item.id],
    `Missing traceability for ${item.id}`
  );
}

const tidyUp = items.find(
  item =>
    item.id ===
    "org.orangepeelit.product.tidyup.v1"
);

require(
  tidyUp,
  "TidyUp is missing from the Catalogue projection."
);

if (tidyUp) {
  require(
    tidyUp.lifecycleState === "BACKLOG",
    `TidyUp lifecycle must be BACKLOG, found ${tidyUp.lifecycleState}`
  );

  require(
    html.includes("TidyUp"),
    "Generated Catalogue HTML does not contain TidyUp."
  );
}

if (failures.length) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        failures
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      checkpoint: projection.checkpoint,
      transactionHash: projection.transactionHash,
      portfolioEntries: items.length,
      tidyUpLifecycle: tidyUp.lifecycleState
    },
    null,
    2
  )
);
