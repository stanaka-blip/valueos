/**
 * 販売店起点一括販売価格の静的回帰（PRODUCT + PACKAGE）
 * 実行: node scripts/pr-dealer-bulk-sales-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migV1 = readFileSync(
  join(
    root,
    "supabase/migrations/20260808180000_create_dealer_sales_prices_rpc.sql"
  ),
  "utf8"
);
const migPkg = readFileSync(
  join(
    root,
    "supabase/migrations/20260923120000_dealer_sales_prices_package_bulk.sql"
  ),
  "utf8"
);
const page = readFileSync(
  join(root, "app/sales-prices/bulk-by-dealer/page.tsx"),
  "utf8"
);
const salesPage = readFileSync(
  join(root, "app/sales-prices/page.tsx"),
  "utf8"
);
const salesNew = readFileSync(
  join(root, "app/sales-prices/new/page.tsx"),
  "utf8"
);
const api = readFileSync(
  join(root, "app/api/dealer-sales-price-bulks/route.ts"),
  "utf8"
);
const salesPricesLib = readFileSync(
  join(root, "lib/salesPrices.ts"),
  "utf8"
);
const logic = readFileSync(
  join(root, "lib/dealerSalesPrices/createDealerSalesPricesLogic.ts"),
  "utf8"
);
const authCookie = readFileSync(
  join(root, "lib/gateway/authCookie.ts"),
  "utf8"
);
const supplierBulkPage = readFileSync(
  join(root, "app/prices/bulk-by-supplier/page.tsx"),
  "utf8"
);

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok - ${name}`);
}

assert("RPC は create_dealer_sales_prices", migPkg.includes("create_dealer_sales_prices"));
assert(
  "products INSERT/UPDATE なし",
  !/INSERT\s+INTO\s+public\.products/i.test(migPkg) &&
    !/UPDATE\s+public\.products/i.test(migPkg)
);
assert(
  "既存 sales_prices UPDATE/DELETE なし",
  !/UPDATE\s+public\.sales_prices/i.test(migPkg) &&
    !/DELETE\s+FROM\s+public\.sales_prices/i.test(migPkg)
);
assert(
  "PACKAGE / PRODUCT 両対応",
  migPkg.includes("price_target_type") &&
    migPkg.includes("'PACKAGE'") &&
    migPkg.includes("'PRODUCT'")
);
assert(
  "PACKAGE 時 product_id 混入拒否",
  migPkg.includes("PACKAGE 指定時は product_id を指定できません")
);
assert(
  "同一リクエスト package 重複拒否",
  migPkg.includes("同じパッケージが複数行に入力されています")
);
assert(
  "販売価格1円以上維持",
  migPkg.includes("販売価格は1円以上で入力してください")
);
assert(
  "ledger + 冪等",
  migV1.includes("dealer_sales_price_bulk_requests") &&
    migPkg.includes("payload_hash") &&
    migPkg.includes("idempotent_replay")
);
assert(
  "gateway CSRF/Idempotency",
  api.includes("assertCsrf") &&
    api.includes("Idempotency-Key") &&
    api.includes("deriveDealerSalesPriceBulkRequestId")
);
assert(
  "namespace 分離",
  authCookie.includes("dealer-sales-price-bulk:v2") &&
    authCookie.includes("supplier-purchase-price-bulk:v2")
);
assert("UI タブ 通常商品/パッケージ", page.includes("通常商品") && page.includes("パッケージ"));
assert("メーカー絞り込み", page.includes("manufacturerId"));
assert(
  "PRODUCT 検索回帰",
  page.includes("matchesProductSearch") && page.includes("型番")
);
assert(
  "PACKAGE 検索",
  page.includes("matchesPackageSearch") && page.includes("fetchActivePackageSalesUnitPrices")
);
assert("inactive PACKAGE 除外", page.includes("isPackageActiveFlag"));
assert(
  "logic が PRODUCT/PACKAGE 両対応",
  logic.includes('price_target_type === "PACKAGE"') &&
    logic.includes("SalesPriceBulkTargetType")
);
assert(
  "バッチヘルパー PRODUCT + PACKAGE",
  salesPricesLib.includes("fetchActiveSalesUnitPrices") &&
    salesPricesLib.includes("fetchActivePackageSalesUnitPrices") &&
    salesPricesLib.includes('eq("price_target_type", "PACKAGE")')
);
assert(
  "sales-prices 一覧から導線",
  salesPage.includes("/sales-prices/bulk-by-dealer") &&
    salesPage.includes("販売店ごとに一括登録")
);
assert(
  "/sales-prices/new を維持",
  salesPage.includes("/sales-prices/new") &&
    salesNew.includes("sales_prices") &&
    salesNew.includes("insert")
);
assert(
  "#109 UI 回帰（仕入先一括が残る）",
  supplierBulkPage.includes("fetchActivePurchaseUnitPrices") &&
    supplierBulkPage.includes("選択した商品の仕入価格を登録")
);
assert(
  "service_role のみ EXECUTE",
  migPkg.includes("GRANT EXECUTE ON FUNCTION public.create_dealer_sales_prices") &&
    migPkg.includes("REVOKE ALL ON FUNCTION public.create_dealer_sales_prices")
);
assert("CASCADE 追加なし", !/ON DELETE CASCADE/i.test(migPkg));

if (process.exitCode) {
  console.error("\nfailed");
  process.exit(1);
}
console.log("\nall checks passed");
