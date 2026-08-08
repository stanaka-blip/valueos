/**
 * 価格一覧検索UIの静的回帰
 * 実行: node scripts/pr-price-list-search-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const prices = readFileSync(join(root, "app/prices/page.tsx"), "utf8");
const sales = readFileSync(join(root, "app/sales-prices/page.tsx"), "utf8");
const form = readFileSync(
  join(root, "app/components/prices/PriceListSearchForm.tsx"),
  "utf8"
);
const query = readFileSync(join(root, "lib/prices/priceListQuery.ts"), "utf8");
const display = readFileSync(
  join(root, "lib/prices/resolveTargetDisplay.ts"),
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

assert("仕入一覧に検索フォーム", prices.includes("PriceListSearchForm"));
assert("販売一覧に検索フォーム", sales.includes("PriceListSearchForm"));
assert("仕入先 filter", form.includes("supplier_id") && prices.includes("supplier_id"));
assert("販売店 filter", form.includes("dealer_id") && sales.includes("dealer_id"));
assert(
  "共通フィルター項目",
  form.includes("manufacturer_id") &&
    form.includes("price_target_type") &&
    form.includes("category") &&
    form.includes("status") &&
    form.includes("クリア")
);
assert("件数表示", form.includes("resultCount"));
assert("AND filter", query.includes("filterPriceListRows"));
assert(
  "キーワード対象",
  query.includes("row.code") &&
    query.includes("row.name") &&
    query.includes("row.manufacturerName")
);
assert(
  "PACKAGE区分ロジック維持",
  display.includes("system_type") && display.includes("capacity_unit")
);
assert(
  "CTA回帰（仕入）",
  prices.includes("/prices/bulk-by-supplier") && prices.includes("/prices/new")
);
assert(
  "CTA回帰（販売）",
  sales.includes("/sales-prices/bulk-by-dealer") &&
    sales.includes("/sales-prices/new")
);
assert(
  "編集/削除コンポーネント維持",
  prices.includes("PriceActions") && sales.includes("SalesPriceActions")
);
assert(
  "Migration/RPCを追加していない（本スクリプト対象外ファイル）",
  !prices.includes("create_") && !sales.includes("rpc(")
);

if (process.exitCode) {
  console.error("\nfailed");
  process.exit(1);
}
console.log("\nall checks passed");
