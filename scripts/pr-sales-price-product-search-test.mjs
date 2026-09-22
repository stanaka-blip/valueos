/**
 * 販売価格 新規/編集: SearchableSelect 契約
 * Run: node scripts/pr-sales-price-product-search-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const newPage = readFileSync(join(root, "app/sales-prices/new/page.tsx"), "utf8");
const editPage = readFileSync(
  join(root, "app/sales-prices/[id]/edit/page.tsx"),
  "utf8"
);

for (const [name, src] of [
  ["new", newPage],
  ["edit", editPage],
]) {
  assert.match(src, /SearchableSelect/, `${name}: SearchableSelect`);
  assert.match(
    src,
    /buildPackageCompositionProductOption|buildProductSearchOption/,
    `${name}: product option builder`
  );
  assert.match(src, /buildPackageSearchOption/, `${name}: package option`);
  assert.doesNotMatch(
    src,
    /<select[\s\S]*name="product_id"/,
    `${name}: no native product select`
  );
  assert.match(src, /product_id/, `${name}: still saves product_id`);
}

assert.match(newPage, /\.eq\("is_active", true\)/);
assert.match(editPage, /利用停止|buildPackageCompositionProductOption/);
assert.match(editPage, /現在選択が inactive|既存選択が inactive|表示維持/);

console.log("OK sales price product search UI contract");
