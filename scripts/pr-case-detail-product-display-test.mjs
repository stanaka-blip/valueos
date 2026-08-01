/**
 * PR-A: 案件詳細の商品表示を登録仕様へ合わせる（表示のみ）
 * 実行: node scripts/pr-case-detail-product-display-test.mjs
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

const pageSrc = read("app/cases/[id]/page.tsx");
const viewSrc = read("app/cases/[id]/CaseDetailView.tsx");
const displaySrc = read("app/cases/[id]/productDisplay.ts");
const addFormSrc = read("app/cases/[id]/products/new/page.tsx");

assert(
  "page selects line_type/product_id/package_id",
  pageSrc.includes("line_type") &&
    pageSrc.includes("product_id") &&
    pageSrc.includes("package_id")
);
assert("page joins packages(name)", pageSrc.includes("packages (") && pageSrc.includes("name"));
assert("page maps via toCaseProductDisplayRow", pageSrc.includes("toCaseProductDisplayRow"));
assert(
  "display helper distinguishes null prices",
  displaySrc.includes("toNullableNumber") && displaySrc.includes("formatNullableYen")
);
assert(
  "view shows line type and nullable yen",
  viewSrc.includes("lineTypeLabel") &&
    viewSrc.includes("formatNullableYen") &&
    viewSrc.includes("sumNullableAmounts")
);
assert(
  "view does not force formatYen on product line prices",
  !/formatYen\(row\.(purchasePrice|salesPrice|grossProfit)\)/.test(viewSrc)
);
assert(
  "add product form unchanged (still anon insert path)",
  addFormSrc.includes('.from("case_products").insert') &&
    addFormSrc.includes("purchase_price") &&
    addFormSrc.includes("sales_price")
);
assert(
  "no case_package_items expansion in display",
  !displaySrc.includes("case_package_items") &&
    !pageSrc.includes("case_package_items")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-detail-product-display-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall static checks passed");
