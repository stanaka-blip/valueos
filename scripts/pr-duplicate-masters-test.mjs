/**
 * 複製して新規登録 UI 契約
 * Run: node scripts/pr-duplicate-masters-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const pkgNew = read("app/packages/new/page.tsx");
assert.match(pkgNew, /copyFrom/);
assert.match(pkgNew, /buildPackageCopyFormValues/);
assert.match(pkgNew, /buildPackageCopyLines/);
assert.match(pkgNew, /PACKAGE_COPY_NOTICE/);
assert.match(
  read("lib/packages/packageCopy.ts"),
  /仕入価格・販売価格はコピーされません/
);

assert.match(read("app/packages/[id]/page.tsx"), /packages\/new\?copyFrom=/);
assert.match(read("app/packages/page.tsx"), /packages\/new\?copyFrom=/);
assert.match(read("app/packages/[id]/edit/page.tsx"), /packages\/new\?copyFrom=/);

const priceNew = read("app/prices/new/page.tsx");
assert.match(priceNew, /copyFrom/);
assert.match(priceNew, /buildPurchasePriceCopyFormValues/);
assert.match(read("app/prices/PriceActions.tsx"), /prices\/new\?copyFrom=/);

const salesNew = read("app/sales-prices/new/page.tsx");
assert.match(salesNew, /copyFrom/);
assert.match(salesNew, /buildSalesPriceCopyFormValues/);
assert.match(salesNew, /SearchableSelect/);
assert.match(
  read("app/sales-prices/SalesPriceActions.tsx"),
  /sales-prices\/new\?copyFrom=/
);

// product既存複製の回帰
assert.match(read("app/products/new/page.tsx"), /copyFrom/);
assert.match(read("app/products/[id]/page.tsx"), /複製して新規登録/);

console.log("OK duplicate masters UI contract");
