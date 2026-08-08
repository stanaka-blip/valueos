import assert from "node:assert/strict";

import {
  buildPackagePriceSummary,
  buildProductPriceSummary,
  parsePriceNewPrefill,
} from "../lib/prices/parsePriceNewPrefill.ts";

const productPrefill = parsePriceNewPrefill({
  product_id: " prod-1 ",
  package_id: "pkg-ignored",
});
assert.equal(productPrefill.fromQuery, true);
assert.equal(productPrefill.price_target_type, "PRODUCT");
assert.equal(productPrefill.product_id, "prod-1");
assert.equal(productPrefill.package_id, "");

const packagePrefill = parsePriceNewPrefill({
  product_id: "",
  package_id: " pkg-9 ",
});
assert.equal(packagePrefill.fromQuery, true);
assert.equal(packagePrefill.price_target_type, "PACKAGE");
assert.equal(packagePrefill.package_id, "pkg-9");
assert.equal(packagePrefill.product_id, "");

const empty = parsePriceNewPrefill({});
assert.equal(empty.fromQuery, false);
assert.equal(empty.price_target_type, "PRODUCT");
assert.equal(empty.product_id, "");
assert.equal(empty.package_id, "");

const productSummary = buildProductPriceSummary({
  name: "パネルA",
  model_no: "SP-100",
  manufacturerName: "Alpha",
});
assert.equal(productSummary.kindLabel, "商品");
assert.equal(productSummary.code, "SP-100");
assert.equal(productSummary.name, "パネルA");
assert.equal(productSummary.manufacturerName, "Alpha");

const packageSummary = buildPackagePriceSummary({
  name: "セットB",
  package_code: "PK-1",
  manufacturerName: "Beta",
});
assert.equal(packageSummary.kindLabel, "パッケージ商品");
assert.equal(packageSummary.code, "PK-1");

console.log("price new prefill deeplink behavior checks passed");
