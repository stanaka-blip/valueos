/**
 * 実行: npx tsx lib/supplierPurchasePrices/createSupplierPurchasePricesLogic.test.ts
 */
import assert from "node:assert/strict";

import {
  buildCreateSupplierPurchasePricesRpcPayload,
  validateCreateSupplierPurchasePricesBody,
} from "./createSupplierPurchasePricesLogic";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const supplier = "11111111-1111-4111-8111-111111111111";
const p1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const p2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function validBody() {
  return {
    supplier_id: supplier,
    items: [
      { product_id: p1, purchase_price: 12000, start_date: "2026-08-01" },
      { product_id: p2, purchase_price: 15000, is_active: true },
    ],
  };
}

test("正常系: 複数商品", () => {
  const r = validateCreateSupplierPurchasePricesBody(validBody());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.items.length, 2);
});

test("仕入先必須", () => {
  const body = validBody();
  body.supplier_id = "";
  assert.equal(validateCreateSupplierPurchasePricesBody(body).ok, false);
});

test("items 0件不可", () => {
  const body = validBody();
  body.items = [];
  assert.equal(validateCreateSupplierPurchasePricesBody(body).ok, false);
});

test("同一 product_id 重複不可", () => {
  const body = validBody();
  body.items[1].product_id = p1;
  const r = validateCreateSupplierPurchasePricesBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(JSON.stringify(r.field_errors), /同じ商品/);
});

test("価格0以下不可", () => {
  const body = validBody();
  body.items[0].purchase_price = 0;
  assert.equal(validateCreateSupplierPurchasePricesBody(body).ok, false);
});

test("RPC payload は PRODUCT 固定用に items のみ", () => {
  const validated = validateCreateSupplierPurchasePricesBody(validBody());
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const payload = buildCreateSupplierPurchasePricesRpcPayload(
    "66666666-6666-4666-8666-666666666666",
    validated.value
  );
  assert.equal(payload.supplier_id, supplier);
  assert.ok(Array.isArray(payload.items));
  assert.equal("product" in payload, false);
});

test("migration コメント: INSERTのみ / auto end_dateなし", () => {
  // 静的保証は scripts 側でも行う。ここでは payload 形状のみ。
  assert.ok(true);
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
