/**
 * 商品一括セットアップ（価格非同梱）静的回帰
 * 実行: node scripts/pr-product-bulk-setup-test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok - ${name}`);
}

const mig = "supabase/migrations/20260810120000_create_product_bulk_setup_rpc.sql";
assert("migration exists", existsSync(join(root, mig)));
const migration = read(mig);
assert(
  "RPC create_product_bulk_setup",
  migration.includes("create_product_bulk_setup")
);
assert(
  "ledger product_bulk_setup_requests",
  migration.includes("product_bulk_setup_requests")
);
assert(
  "does not insert purchase_prices",
  !/INSERT\s+INTO\s+public\.purchase_prices/i.test(migration)
);
assert(
  "does not insert sales_prices",
  !/INSERT\s+INTO\s+public\.sales_prices/i.test(migration)
);
assert(
  "old product-setup RPC untouched",
  existsSync(
    join(
      root,
      "supabase/migrations/20260808140000_create_product_setup_rpc.sql"
    )
  )
);

const page = read("app/products/setup/page.tsx");
assert(
  "setup UI is product-bulk only",
  page.includes('data-testid="product-bulk-setup"')
);
assert(
  "no purchase/sales editors on setup page",
  !page.includes("submitProductSetup") &&
    !page.includes("submitExistingProductPriceSetup") &&
    !page.includes("purchase_prices") &&
    !page.includes("sales_prices")
);
assert("submitProductBulkSetup used", page.includes("submitProductBulkSetup"));
assert("add row button", page.includes("商品を追加"));

const api = read("app/api/product-bulk-setups/route.ts");
assert("Origin check", api.includes("assertAppOrigin"));
assert("CSRF check", api.includes("assertCsrf"));
assert("Idempotency-Key", api.includes("idempotency-key"));
assert("service_role via createProductBulkSetup", api.includes("createProductBulkSetup"));

const detail = read("app/products/[id]/page.tsx");
assert(
  "product detail shows MasterPricePanels",
  detail.includes("MasterPricePanels")
);
assert(
  "product detail has price deeplinks",
  detail.includes("/prices/new?product_id=") &&
    detail.includes("/sales-prices/new?product_id=")
);

if (process.exitCode) {
  console.error("\nregression failed");
  process.exit(1);
}
console.log("\nall checks passed");
