/**
 * 商品単位 select 契約（新規/編集/一括）
 * Run: node scripts/pr-product-unit-select-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const files = [
  "app/products/new/page.tsx",
  "app/products/[id]/edit/page.tsx",
  "app/products/setup/page.tsx",
  "lib/products/productUnits.ts",
];

for (const rel of files) {
  const src = readFileSync(join(root, rel), "utf8");
  assert.match(src, /getProductUnitSelectOptions|STANDARD_PRODUCT_UNITS/);
}

const units = readFileSync(join(root, "lib/products/productUnits.ts"), "utf8");
for (const u of ["枚", "kW", "台", "個", "本", "式"]) {
  assert.match(units, new RegExp(`"${u}"`));
}

const setup = readFileSync(join(root, "app/products/setup/page.tsx"), "utf8");
assert.match(setup, /<select/);
assert.doesNotMatch(setup, /placeholder="枚 \/ 台"/);

console.log("OK product unit select contract");
