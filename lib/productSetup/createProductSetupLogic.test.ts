/**
 * 実行: npx tsx lib/productSetup/createProductSetupLogic.test.ts
 */
import assert from "node:assert/strict";

import {
  buildCreateProductSetupRpcPayload,
  validateCreateProductSetupBody,
} from "./createProductSetupLogic";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const supplierA = "11111111-1111-4111-8111-111111111111";
const supplierB = "22222222-2222-4222-8222-222222222222";
const dealerA = "33333333-3333-4333-8333-333333333333";
const manufacturer = "44444444-4444-4444-8444-444444444444";

function validBody() {
  return {
    product: {
      manufacturer_id: manufacturer,
      model_no: "M-1",
      name: "テスト商品",
      default_supplier_id: supplierA,
      is_active: true,
    },
    purchase_prices: [
      {
        supplier_id: supplierA,
        purchase_price: 1000,
        start_date: "2026-08-01",
        is_active: true,
      },
      {
        supplier_id: supplierB,
        purchase_price: 1100,
        is_active: true,
      },
    ],
    sales_prices: [
      {
        dealer_id: dealerA,
        sales_price: 2000,
        is_active: true,
      },
    ],
  };
}

test("正常系: 仕入複数・販売複数を受け付ける", () => {
  const r = validateCreateProductSetupBody(validBody());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.purchase_prices.length, 2);
    assert.equal(r.value.sales_prices.length, 1);
  }
});

test("仕入価格0件は拒否", () => {
  const body = validBody();
  body.purchase_prices = [];
  const r = validateCreateProductSetupBody(body);
  assert.equal(r.ok, false);
});

test("販売価格0件は許可", () => {
  const body = validBody();
  body.sales_prices = [];
  const r = validateCreateProductSetupBody(body);
  assert.equal(r.ok, true);
});

test("同じ仕入先の重複は拒否", () => {
  const body = validBody();
  body.purchase_prices[1].supplier_id = supplierA;
  const r = validateCreateProductSetupBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(
      JSON.stringify(r.field_errors),
      /同じ仕入先/
    );
  }
});

test("同じ販売店の重複は拒否", () => {
  const body = validBody();
  body.sales_prices.push({
    dealer_id: dealerA,
    sales_price: 3000,
    is_active: true,
  });
  const r = validateCreateProductSetupBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(JSON.stringify(r.field_errors), /同じ販売店/);
  }
});

test("標準仕入先は仕入価格の仕入先に含まれていること", () => {
  const body = validBody();
  body.product.default_supplier_id = "55555555-5555-4555-8555-555555555555";
  const r = validateCreateProductSetupBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(
      JSON.stringify(r.field_errors),
      /標準仕入先は仕入価格/
    );
  }
});

test("RPC payload は request_id と配列を含む", () => {
  const body = validBody();
  const validated = validateCreateProductSetupBody(body);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const payload = buildCreateProductSetupRpcPayload(
    "66666666-6666-4666-8666-666666666666",
    validated.value
  );
  assert.equal(payload.request_id, "66666666-6666-4666-8666-666666666666");
  assert.ok(Array.isArray(payload.purchase_prices));
  assert.ok(Array.isArray(payload.sales_prices));
  assert.equal(
    (payload.product as { default_supplier_id: string }).default_supplier_id,
    supplierA
  );
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
if (failed > 0) {
  process.exit(1);
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
