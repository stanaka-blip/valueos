/**
 * PR: 商品/パッケージ一覧 → 価格登録プリフィル導線
 * 実行: node scripts/pr-price-new-prefill-deeplink-test.mjs
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
const purchaseNew = read("app/prices/new/page.tsx");
const salesNew = read("app/sales-prices/new/page.tsx");
const helper = read("lib/prices/parsePriceNewPrefill.ts");
const purchasePricesLib = read("lib/purchasePrices.ts");
const salesPricesLib = read("lib/salesPrices.ts");

assert(
  "product list deeplinks",
  productsPage.includes("仕入価格を追加") &&
    productsPage.includes("販売価格を追加") &&
    productsPage.includes("/prices/new?product_id=") &&
    productsPage.includes("/sales-prices/new?product_id=")
);

assert(
  "package list deeplinks",
  packagesPage.includes("仕入価格を追加") &&
    packagesPage.includes("販売価格を追加") &&
    packagesPage.includes("/prices/new?package_id=") &&
    packagesPage.includes("/sales-prices/new?package_id=")
);

assert(
  "purchase new reads product/package query prefill",
  purchaseNew.includes("useSearchParams") &&
    purchaseNew.includes("parsePriceNewPrefill") &&
    purchaseNew.includes("PriceTargetPrefillBanner") &&
    purchaseNew.includes('from("purchase_prices")').toString() !== "false"
);

assert(
  "sales new reads product/package query prefill",
  salesNew.includes("useSearchParams") &&
    salesNew.includes("parsePriceNewPrefill") &&
    salesNew.includes("PriceTargetPrefillBanner")
);

assert(
  "helper maps PRODUCT/PACKAGE from query",
  helper.includes('price_target_type: "PRODUCT"') &&
    helper.includes('price_target_type: "PACKAGE"') &&
    helper.includes("fromQuery")
);

assert(
  "purchase insert payload shape unchanged",
  purchaseNew.includes("price_target_type: form.price_target_type") &&
    purchaseNew.includes("product_id: isProduct ? form.product_id : null") &&
    purchaseNew.includes("package_id: isProduct ? null : form.package_id") &&
    purchaseNew.includes("supplier_id: form.supplier_id") &&
    purchaseNew.includes("purchase_price: purchasePrice") &&
    purchaseNew.includes("end_date: form.end_date || null")
);

assert(
  "sales insert payload shape unchanged",
  salesNew.includes("dealer_id: form.dealer_id") &&
    salesNew.includes("sales_price: Number(form.sales_price)") &&
    salesNew.includes("product_id: isProduct ? form.product_id : null") &&
    salesNew.includes("package_id: isProduct ? null : form.package_id")
);

assert(
  "active price lookup rules untouched",
  purchasePricesLib.includes('.order("start_date", { ascending: false })') &&
    salesPricesLib.includes('.order("start_date", { ascending: false })') &&
    salesPricesLib.includes('.eq("is_active", true)')
);

assert(
  "no previous-row auto-close updates on new forms",
  !purchaseNew.includes('.from("purchase_prices").update') &&
    !salesNew.includes('.from("sales_prices").update')
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-price-new-prefill-deeplink-behavior.mts"],
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
console.log("\nall price new prefill deeplink checks passed");
