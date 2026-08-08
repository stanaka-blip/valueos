/**
 * PR: 商品/パッケージ詳細の価格パネル（読取専用）
 * 実行: node scripts/pr-master-price-panels-test.mjs
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

const loader = read("lib/prices/loadMasterPricePanels.ts");
const panels = read("app/components/prices/MasterPricePanels.tsx");
const productEdit = read("app/products/[id]/edit/page.tsx");
const packageEdit = read("app/packages/[id]/edit/page.tsx");
const productsList = read("app/products/page.tsx");
const packagesList = read("app/packages/page.tsx");
const purchaseLib = read("lib/purchasePrices.ts");
const salesLib = read("lib/salesPrices.ts");

assert(
  "loader uses official active price helpers",
  loader.includes("fetchActivePurchasePrice") &&
    loader.includes("fetchActiveSalesPrice") &&
    loader.includes('.order("start_date", { ascending: false })') &&
    !loader.includes("created_at")
);

assert(
  "loader batches history by target",
  loader.includes('from("purchase_prices")') &&
    loader.includes('from("sales_prices")') &&
    loader.includes('eq("price_target_type", targetType)')
);

assert(
  "panels show current + history + add CTAs",
  panels.includes("現行仕入価格") &&
    panels.includes("現行販売価格") &&
    panels.includes("仕入価格履歴") &&
    panels.includes("販売価格履歴") &&
    panels.includes("仕入価格を追加") &&
    panels.includes("販売価格を追加") &&
    panels.includes("/prices/new?product_id=") &&
    panels.includes("/sales-prices/new?product_id=") &&
    panels.includes("/prices/new?package_id=") &&
    panels.includes("/sales-prices/new?package_id=")
);

assert(
  "product edit mounts PRODUCT panels",
  productEdit.includes("MasterPricePanels") &&
    productEdit.includes('targetType="PRODUCT"') &&
    productEdit.includes("productId={id}")
);

assert(
  "package edit mounts PACKAGE panels",
  packageEdit.includes("MasterPricePanels") &&
    packageEdit.includes('targetType="PACKAGE"') &&
    packageEdit.includes("packageId={id}")
);

assert(
  "PR102 list deeplinks retained",
  productsList.includes("/prices/new?product_id=") &&
    productsList.includes("/sales-prices/new?product_id=") &&
    packagesList.includes("/prices/new?package_id=") &&
    packagesList.includes("/sales-prices/new?package_id=")
);

assert(
  "read-only: no price insert/update/delete in panels/loader",
  !loader.includes(".insert(") &&
    !loader.includes(".update(") &&
    !loader.includes(".delete(") &&
    !panels.includes(".insert(") &&
    !panels.includes(".update(")
);

assert(
  "official lookup rules unchanged",
  purchaseLib.includes('.order("start_date", { ascending: false })') &&
    salesLib.includes('.order("start_date", { ascending: false })') &&
    purchaseLib.includes(".eq(\"is_active\", true)") ||
    purchaseLib.includes('.eq("is_active", true)')
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-master-price-panels-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(tsc.stdout || "");
process.stderr.write(tsc.stderr || "");
assert("tsc --noEmit", tsc.status === 0, `status=${tsc.status}`);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, CI: "true" },
});
if (build.status !== 0) {
  process.stdout.write(build.stdout || "");
  process.stderr.write(build.stderr || "");
}
assert("npm run build", build.status === 0, `status=${build.status}`);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall master price panels checks passed");
