/**
 * 旧「既存商品+価格」セットアップ UI は商品一括マスタ登録へ置換された。
 * 価格登録は /prices /sales-prices / 商品詳細の MasterPricePanels を維持。
 * 実行: node scripts/pr-existing-product-setup-ui-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const page = readFileSync(join(root, "app/products/setup/page.tsx"), "utf8");
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260808160000_create_existing_product_price_setup_rpc.sql"
  ),
  "utf8"
);
const logic = readFileSync(
  join(root, "lib/productSetup/createExistingProductPriceSetupLogic.ts"),
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
  "setup page is products-only bulk",
  page.includes('data-testid="product-bulk-setup"') &&
    page.includes("submitProductBulkSetup")
);
assert(
  "setup page no longer hosts existing+price dual mode",
  !page.includes('data-testid="existing-product-setup"') &&
    !page.includes("submitExistingProductPriceSetup")
);
assert(
  "existing price RPC migration still present (untouched API path)",
  migration.includes("create_existing_product_price_setup") &&
    !/UPDATE\s+public\.products/i.test(migration) &&
    !/INSERT\s+INTO\s+public\.products/i.test(migration)
);
assert(
  "existing price logic still present",
  logic.includes("buildCreateExistingProductPriceSetupRpcPayload")
);

if (process.exitCode) {
  console.error("\nregression failed");
  process.exit(1);
}
console.log("\nall checks passed");
