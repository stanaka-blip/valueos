/**
 * Phase2 /products/setup UI 回帰（静的ソース確認）
 * 実行: node scripts/pr-existing-product-setup-ui-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const page = readFileSync(join(root, "app/products/setup/page.tsx"), "utf8");
const logic = readFileSync(
  join(root, "lib/productSetup/createExistingProductPriceSetupLogic.ts"),
  "utf8"
);
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260808160000_create_existing_product_price_setup_rpc.sql"
  ),
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
  "初期モードは existing",
  /useState<SetupMode>\("existing"\)/.test(page)
);
assert(
  "既存商品モード切替ボタンがある",
  page.includes('label="既存商品を選択"')
);
assert(
  "新規モード切替は「新規商品を登録」",
  page.includes('label="新規商品を登録"')
);
assert(
  "既存モード UI ブロックがある",
  page.includes('data-testid="existing-product-setup"') &&
    page.includes('data-testid="existing-product-picker"')
);
assert(
  "新規フォームは new モード専用",
  page.includes('data-testid="new-product-setup"') &&
    /mode === "existing"\s*\?/.test(page)
);
assert(
  "Picker 候補は 型番｜商品名｜シリーズ 形式",
  page.includes('].join(" ｜ ")')
);
assert(
  "既存モードは product_id で価格APIへ送る",
  page.includes("submitExistingProductPriceSetup") &&
    page.includes("product_id: selectedProductId")
);
assert(
  "既存RPCは products INSERT/UPDATE しない",
  migration.includes("create_existing_product_price_setup") &&
    !/UPDATE\s+public\.products/i.test(migration) &&
    !/INSERT\s+INTO\s+public\.products/i.test(migration)
);
assert(
  "既存ロジック RPC payload は product_id 配列中心",
  logic.includes("buildCreateExistingProductPriceSetupRpcPayload") &&
    /return \{\s*request_id: requestId,\s*product_id: body\.product_id/s.test(
      logic
    )
);

if (process.exitCode) {
  console.error("\nregression failed");
  process.exit(1);
}
console.log("\nall checks passed");
