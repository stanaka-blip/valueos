/**
 * 販売店起点一括販売価格の静的回帰
 * 実行: node scripts/pr-dealer-bulk-sales-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const mig = readFileSync(
  join(
    root,
    "supabase/migrations/20260808180000_create_dealer_sales_prices_rpc.sql"
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
const authCookie = readFileSync(
  join(root, "lib/gateway/authCookie.ts"),
  "utf8"
);
const supplierMig = readFileSync(
  join(
    root,
    "supabase/migrations/20260808170000_create_supplier_purchase_prices_rpc.sql"
  ),
  "utf8"
);
const productSetupMig = readFileSync(
  join(root, "supabase/migrations/20260808140000_create_product_setup_rpc.sql"),
  "utf8"
);
const existingSetupMig = readFileSync(
  join(
    root,
    "supabase/migrations/20260808160000_create_existing_product_price_setup_rpc.sql"
  ),
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

assert(
  "RPC は create_dealer_sales_prices",
  mig.includes("create_dealer_sales_prices")
);
assert(
  "products INSERT/UPDATE なし",
  !/INSERT\s+INTO\s+public\.products/i.test(mig) &&
    !/UPDATE\s+public\.products/i.test(mig)
);
assert(
  "既存 sales_prices UPDATE/DELETE なし",
  !/UPDATE\s+public\.sales_prices/i.test(mig) &&
    !/DELETE\s+FROM\s+public\.sales_prices/i.test(mig)
);
assert(
  "auto end_date なし",
  mig.includes("auto end_date は行わない") || !/auto\s+end_date/i.test(mig)
);
assert("PRODUCT 固定 INSERT", mig.includes("'PRODUCT'"));
assert("package_id は NULL", mig.includes("NULL,\n        v_dealer_id") || mig.includes("package_id,\n        dealer_id"));
assert(
  "同一リクエスト product 重複拒否",
  mig.includes("同じ商品が複数行に入力されています")
);
assert(
  "不正 dealer / product NOT_FOUND",
  mig.includes("販売店が見つかりません") && mig.includes("商品が見つかりません")
);
assert(
  "ledger + 冪等",
  mig.includes("dealer_sales_price_bulk_requests") &&
    mig.includes("payload_hash") &&
    mig.includes("idempotent_replay") &&
    mig.includes("REQUEST_ID_CONFLICT") &&
    mig.includes("REQUEST_IN_PROGRESS")
);
assert(
  "atomic EXCEPTION rollback パターン",
  mig.includes("EXCEPTION") && mig.includes("FAILED")
);
assert(
  "gateway CSRF/Idempotency",
  api.includes("assertCsrf") &&
    api.includes("Idempotency-Key") &&
    api.includes("deriveDealerSalesPriceBulkRequestId") &&
    api.includes("assertAppOrigin")
);
assert(
  "namespace 分離",
  authCookie.includes("dealer-sales-price-bulk:v1") &&
    authCookie.includes("supplier-purchase-price-bulk:v1")
);
assert(
  "UI は販売店+メーカー一覧方式",
  page.includes("販売店ごとに一括") ||
    page.includes("選択した商品の販売価格を登録")
);
assert("メーカー絞り込み", page.includes("manufacturerId"));
assert(
  "型番・商品名検索",
  page.includes("matchesProductSearch") && page.includes("型番")
);
assert("categoryフィルタ", page.includes("category"));
assert(
  "現行価格バッチ取得を使う",
  page.includes("fetchActiveSalesUnitPrices")
);
assert(
  "バッチヘルパーが正式条件を使う",
  salesPricesLib.includes("fetchActiveSalesUnitPrices") &&
    salesPricesLib.includes('eq("price_target_type", "PRODUCT")') &&
    salesPricesLib.includes('eq("dealer_id", params.dealerId)') &&
    salesPricesLib.includes(".order(\"start_date\", { ascending: false })")
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
  "#109 RPC を変更しない",
  supplierMig.includes("create_supplier_purchase_prices") &&
    !mig.includes("create_supplier_purchase_prices(")
);
assert(
  "#106/#108 RPC を変更しない",
  productSetupMig.includes("create_product_setup") &&
    existingSetupMig.includes("create_existing_product_price_setup") &&
    !mig.includes("create_product_setup(") &&
    !mig.includes("create_existing_product_price_setup(")
);
assert(
  "#109 UI 回帰（仕入先一括が残る）",
  supplierBulkPage.includes("fetchActivePurchaseUnitPrices") &&
    supplierBulkPage.includes("選択した商品の仕入価格を登録")
);
assert(
  "service_role のみ EXECUTE",
  mig.includes("GRANT EXECUTE ON FUNCTION public.create_dealer_sales_prices") &&
    mig.includes("REVOKE ALL ON FUNCTION public.create_dealer_sales_prices")
);

if (process.exitCode) {
  console.error("\nfailed");
  process.exit(1);
}
console.log("\nall checks passed");
