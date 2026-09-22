/**
 * 発注編集（納品確認）の小数数量 UI 契約
 * Run: node scripts/pr-delivery-decimal-quantity-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const editPage = readFileSync(
  join(root, "app/orders/[id]/edit/page.tsx"),
  "utf8"
);

assert.match(editPage, /step="any"/);
assert.match(editPage, /parseOrderQuantity/);
assert.match(editPage, /数量は0より大きい数値で入力してください/);
assert.doesNotMatch(
  editPage,
  /type="number"\s+min="1"\s+step="1"\s+value=\{line\.quantity\}/
);

console.log("OK delivery decimal quantity UI contract");
