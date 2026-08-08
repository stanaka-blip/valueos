/**
 * 実行: npx tsx lib/productSetup/createExistingProductPriceSetupLogic.test.ts
 */
import assert from "node:assert/strict";

import {
  buildCreateExistingProductPriceSetupRpcPayload,
  validateCreateExistingProductPriceSetupBody,
} from "./createExistingProductPriceSetupLogic";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const supplierA = "11111111-1111-4111-8111-111111111111";
const supplierB = "22222222-2222-4222-8222-222222222222";
const dealerA = "33333333-3333-4333-8333-333333333333";

function validBody() {
  return {
    product_id: productId,
    purchase_prices: [
      { supplier_id: supplierA, purchase_price: 1000, is_active: true },
      { supplier_id: supplierB, purchase_price: 1100, is_active: true },
    ],
    sales_prices: [
      { dealer_id: dealerA, sales_price: 2000, is_active: true },
    ],
  };
}

test("既存商品: 仕入複数・販売あり", () => {
  const r = validateCreateExistingProductPriceSetupBody(validBody());
  assert.equal(r.ok, true);
});

test("product_id 必須", () => {
  const body = validBody();
  body.product_id = "";
  const r = validateCreateExistingProductPriceSetupBody(body);
  assert.equal(r.ok, false);
});

test("販売0件可", () => {
  const body = validBody();
  body.sales_prices = [];
  const r = validateCreateExistingProductPriceSetupBody(body);
  assert.equal(r.ok, true);
});

test("仕入0件不可", () => {
  const body = validBody();
  body.purchase_prices = [];
  const r = validateCreateExistingProductPriceSetupBody(body);
  assert.equal(r.ok, false);
});

test("仕入先重複不可", () => {
  const body = validBody();
  body.purchase_prices[1].supplier_id = supplierA;
  const r = validateCreateExistingProductPriceSetupBody(body);
  assert.equal(r.ok, false);
});

test("payload に product ブロックを含めない", () => {
  const validated = validateCreateExistingProductPriceSetupBody(validBody());
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const payload = buildCreateExistingProductPriceSetupRpcPayload(
    "66666666-6666-4666-8666-666666666666",
    validated.value
  );
  assert.equal(payload.product_id, productId);
  assert.equal("product" in payload, false);
});

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok - ${t.name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(e);
  }
}
if (failed > 0) process.exit(1);
console.log(`\n${tests.length - failed}/${tests.length} passed`);
