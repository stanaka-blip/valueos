/**
 * PR-D1: 案件詳細からの発注画面整備 テスト（本番DB書込なし）
 * 実行: node scripts/pr-case-detail-order-ui-test.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const pageSrc = read("app/cases/[id]/orders/new/page.tsx");
const buildSrc = read("app/cases/[id]/buildOrderLines.ts");
const pricesSrc = read("lib/purchasePrices.ts");
const targetsSrc = read("app/cases/[id]/orders/orderTargets.ts");

assert(
  "page uses buildOrderTargets (per-line/package supplier model)",
  pageSrc.includes("buildOrderTargets") &&
    targetsSrc.includes("buildOrderTargets")
);
assert(
  "page loads line_type and case_packages.quantity",
  pageSrc.includes("line_type") &&
    /from\("case_packages"\)[\s\S]*?quantity[\s\S]*?case_package_items/.test(
      pageSrc
    )
);
assert(
  "page blocks unset unit price",
  pageSrc.includes("isUnitPriceUnset") &&
    (pageSrc.includes("仕入単価が未設定") ||
      targetsSrc.includes("仕入単価が未設定"))
);
assert(
  "page confirms real zero separately",
  pageSrc.includes("isUnitPriceRealZero") &&
    pageSrc.includes("0円の明細があります")
);
assert(
  "page requires supplier (per target, not header)",
  !pageSrc.includes('name="supplier_id"') &&
    (pageSrc.includes("仕入先を選択してください") ||
      targetsSrc.includes("仕入先を選択してください"))
);
assert(
  "build skips PACKAGE header",
  buildSrc.includes('lt === "PACKAGE"') &&
    buildSrc.includes("isProductCaseLine")
);
assert(
  "build documents 構成×パッケージ",
  buildSrc.includes("構成数量×パッケージ数量") ||
    buildSrc.includes("構成数量 × パッケージ数量")
);
assert(
  "build does not Math.max quantity to 1",
  !buildSrc.includes("Math.max")
);
assert(
  "NULL vs 0 unit price distinguished",
  buildSrc.includes('unitPrice: ""') &&
    buildSrc.includes("hasCaseSnapshot") &&
    buildSrc.includes("isUnitPriceRealZero")
);
assert(
  "batch purchase prices filter PRODUCT target type",
  pricesSrc.includes('.eq("price_target_type", "PRODUCT")')
);
assert(
  "page does not touch dealer paths",
  !pageSrc.includes("app/dealer") && !pageSrc.includes("/dealer/")
);
assert(
  "page does not reference invoices new",
  !pageSrc.includes("invoices/new")
);

const dealerDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main...HEAD", "--", "app/dealer"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no dealer file diffs vs main",
  (dealerDiff.stdout || "").trim() === "",
  dealerDiff.stdout
);

const migDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main...HEAD", "--", "supabase/migrations"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no migration diffs vs main",
  (migDiff.stdout || "").trim() === "",
  migDiff.stdout
);

const invoiceDiff = spawnSync(
  "git",
  [
    "diff",
    "--name-only",
    "origin/main...HEAD",
    "--",
    "app/cases/[id]/invoices",
    "app/invoices",
    "app/cases/page.tsx",
    "lib/dashboard",
  ],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no invoice/list/dashboard diffs vs main",
  (invoiceDiff.stdout || "").trim() === "",
  invoiceDiff.stdout
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-detail-order-ui-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll checks passed");
