/**
 * PR: 商品/パッケージ一覧の現行仕入価格列
 * 実行: node scripts/pr-list-current-purchase-price-test.mjs
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

const productsPage = read("app/products/page.tsx");
const packagesPage = read("app/packages/page.tsx");
const purchaseLib = read("lib/purchasePrices.ts");
const productQuery = read("app/products/productListQuery.ts");
const productDetail = read("app/products/[id]/page.tsx");

assert(
  "products list shows current purchase column + batch helper",
  productsPage.includes("現行仕入価格") &&
    productsPage.includes("fetchListCurrentPurchaseUnitPrices") &&
    productsPage.includes('targetType: "PRODUCT"') &&
    productsPage.includes("default_supplier_id") &&
    productsPage.includes("formatYen")
);

assert(
  "packages list shows current purchase column + batch helper",
  packagesPage.includes("現行仕入価格") &&
    packagesPage.includes("fetchListCurrentPurchaseUnitPrices") &&
    packagesPage.includes('targetType: "PACKAGE"') &&
    packagesPage.includes("default_supplier_id")
);

assert(
  "list does not show sales prices",
  !productsPage.includes("現行販売") &&
    !packagesPage.includes("現行販売") &&
    !productsPage.includes("fetchActiveSalesPrice")
);

assert(
  "batch loader uses official active window (no per-row fetchActivePurchasePrice loop)",
  purchaseLib.includes("fetchListCurrentPurchaseUnitPrices") &&
    purchaseLib.includes("pickActivePurchaseUnitForTarget") &&
    purchaseLib.includes("matchesActivePurchaseWindow") &&
    purchaseLib.includes('.eq("is_active", true)') &&
    purchaseLib.includes('.lte("start_date", asOfDate)')
);

assert(
  "N+1 avoided: list pages call batch once, not fetchActivePurchasePrice in map",
  productsPage.includes("fetchListCurrentPurchaseUnitPrices") &&
    !productsPage.includes("fetchActivePurchasePrice") &&
    packagesPage.includes("fetchListCurrentPurchaseUnitPrices") &&
    !packagesPage.includes("fetchActivePurchasePrice")
);

assert(
  "search/filter helpers unchanged",
  productQuery.includes("filterProductListRows") &&
    productQuery.includes('DEFAULT_PRODUCT_LIST_STATUS') &&
    productsPage.includes("filterProductListRows") &&
    packagesPage.includes("filterPackageListRows")
);

assert(
  "detail and price deeplinks retained",
  productsPage.includes("/prices/new?product_id=") &&
    productsPage.includes("/sales-prices/new?product_id=") &&
    packagesPage.includes("/prices/new?package_id=") &&
    productDetail.includes("MasterPricePanels")
);

assert(
  "no price mutation in list helper",
  !purchaseLib.includes('.from("purchase_prices").insert') &&
    !purchaseLib.includes('.from("purchase_prices").update')
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-list-current-purchase-price-behavior.mts"],
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
console.log("\nall list current purchase price checks passed");
