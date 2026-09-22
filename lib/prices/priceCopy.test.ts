/**
 * Run: npx tsx lib/prices/priceCopy.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPurchasePriceCopyFormValues,
  buildSalesPriceCopyFormValues,
  formatPriceCopyAmount,
} from "./priceCopy";

test("明示0円は '0' のまま", () => {
  assert.equal(formatPriceCopyAmount(0), "0");
  assert.equal(formatPriceCopyAmount("0"), "0");
  assert.equal(formatPriceCopyAmount(null), "");
});

test("PRODUCT仕入価格コピー", () => {
  const form = buildPurchasePriceCopyFormValues({
    price_target_type: "PRODUCT",
    product_id: "prod-1",
    package_id: null,
    supplier_id: "sup-1",
    purchase_price: 0,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    memo: "コピー元",
    is_active: false,
  });
  assert.equal(form.price_target_type, "PRODUCT");
  assert.equal(form.product_id, "prod-1");
  assert.equal(form.package_id, "");
  assert.equal(form.purchase_price, "0");
  assert.equal(form.start_date, "2026-01-01");
  assert.equal(form.memo, "コピー元");
  assert.equal(form.is_active, true);
});

test("PACKAGE仕入価格コピー", () => {
  const form = buildPurchasePriceCopyFormValues({
    price_target_type: "PACKAGE",
    product_id: null,
    package_id: "pkg-1",
    supplier_id: "sup-1",
    purchase_price: 120000,
    start_date: null,
    end_date: null,
    memo: null,
  });
  assert.equal(form.price_target_type, "PACKAGE");
  assert.equal(form.package_id, "pkg-1");
  assert.equal(form.product_id, "");
  assert.equal(form.purchase_price, "120000");
});

test("販売価格コピー（dealer含む）", () => {
  const form = buildSalesPriceCopyFormValues({
    dealer_id: "d1",
    price_target_type: "PRODUCT",
    product_id: "prod-1",
    package_id: null,
    sales_price: 150000,
    start_date: "2026-04-01",
    end_date: "",
    memo: "販価",
    is_active: "false",
  });
  assert.equal(form.dealer_id, "d1");
  assert.equal(form.sales_price, "150000");
  assert.equal(form.is_active, true);
  assert.equal(form.memo, "販価");
});
