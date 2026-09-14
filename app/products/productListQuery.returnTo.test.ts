/**
 * 商品一覧フィルタの returnTo 保持
 * Run: npx tsx app/products/productListQuery.returnTo.test.ts
 */
import assert from "node:assert/strict";

import {
  buildProductListHref,
  sanitizeProductsReturnTo,
  withProductsReturnTo,
} from "./productListQuery";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("OK", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, e);
  }
}

check("build keeps filters", () => {
  const href = buildProductListHref({
    q: "長州",
    manufacturerId: "m1",
    category: "蓄電池",
    status: "active",
  });
  assert.equal(href.includes("q="), true);
  assert.equal(href.includes("manufacturer_id=m1"), true);
  assert.equal(href.includes("category="), true);
  assert.equal(href.includes("status=active"), true);
});

check("sanitize allows list paths only", () => {
  assert.equal(sanitizeProductsReturnTo("/products?q=a&category=b"), "/products?q=a&category=b");
  assert.equal(sanitizeProductsReturnTo("/products"), "/products");
  assert.equal(sanitizeProductsReturnTo("/products/xxx"), null);
  assert.equal(sanitizeProductsReturnTo("https://evil.example/products"), null);
  assert.equal(sanitizeProductsReturnTo("//evil/products"), null);
});

check("with appends param", () => {
  assert.equal(
    withProductsReturnTo("/products/p1/edit", "/products?q=x"),
    "/products/p1/edit?returnTo=%2Fproducts%3Fq%3Dx"
  );
});

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll returnTo checks passed");
