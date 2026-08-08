/**
 * 仕入先起点一括仕入価格の静的回帰
 * 実行: node scripts/pr-supplier-bulk-purchase-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const mig = readFileSync(
  join(
    root,
    "supabase/migrations/20260808170000_create_supplier_purchase_prices_rpc.sql"
  ),
  "utf8"
);
const page = readFileSync(
  join(root, "app/prices/bulk-by-supplier/page.tsx"),
  "utf8"
);
const pricesPage = readFileSync(join(root, "app/prices/page.tsx"), "utf8");
const api = readFileSync(
  join(root, "app/api/supplier-purchase-price-bulks/route.ts"),
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
  "RPC は create_supplier_purchase_prices",
  mig.includes("create_supplier_purchase_prices")
);
assert(
  "products INSERT/UPDATE なし",
  !/INSERT\s+INTO\s+public\.products/i.test(mig) &&
    !/UPDATE\s+public\.products/i.test(mig)
);
assert(
  "既存 purchase_prices UPDATE/DELETE なし",
  !/UPDATE\s+public\.purchase_prices/i.test(mig) &&
    !/DELETE\s+FROM\s+public\.purchase_prices/i.test(mig)
);
assert("auto end_date なし", !/auto end_date/i.test(mig) || mig.includes("auto end_date は行わない"));
assert("PRODUCT 固定 INSERT", mig.includes("'PRODUCT'"));
assert(
  "同一リクエスト product 重複拒否",
  mig.includes("同じ商品が複数行に入力されています")
);
assert(
  "ledger + 冪等",
  mig.includes("supplier_purchase_price_bulk_requests") &&
    mig.includes("payload_hash") &&
    mig.includes("idempotent_replay")
);
assert(
  "gateway CSRF/Idempotency",
  api.includes("assertCsrf") &&
    api.includes("Idempotency-Key") &&
    api.includes("deriveSupplierPurchasePriceBulkRequestId")
);
assert(
  "UI は仕入先+メーカー一覧方式",
  page.includes("bulk-by-supplier") ||
    page.includes("仕入先ごとに一括") ||
    page.includes("選択した商品の仕入価格を登録")
);
assert(
  "現行価格バッチ取得を使う",
  page.includes("fetchActivePurchaseUnitPrices")
);
assert(
  "prices 一覧から導線",
  pricesPage.includes("/prices/bulk-by-supplier") &&
    pricesPage.includes("仕入先ごとに一括登録")
);
assert(
  "#106/#108 RPC を変更しない（新ファイルのみ）",
  !mig.includes("create_product_setup(") ||
    mig.includes("#106 / #108 RPC は変更しない")
);

if (process.exitCode) {
  console.error("\nfailed");
  process.exit(1);
}
console.log("\nall checks passed");
