/**
 * 実行: npx tsx lib/dealerSalesPrices/createDealerSalesPricesLogic.test.ts
 */
import assert from "node:assert/strict";

import {
  buildCreateDealerSalesPricesRpcPayload,
  validateCreateDealerSalesPricesBody,
} from "./createDealerSalesPricesLogic";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const dealer = "11111111-1111-4111-8111-111111111111";
const p1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const p2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const pkg1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const pkg2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function validProductBody() {
  return {
    dealer_id: dealer,
    items: [
      { product_id: p1, sales_price: 22000, start_date: "2026-08-01" },
      { product_id: p2, sales_price: 25000, is_active: true },
    ],
  };
}

function validPackageBody() {
  return {
    dealer_id: dealer,
    price_target_type: "PACKAGE" as const,
    items: [
      { package_id: pkg1, sales_price: 1320000, start_date: "2026-08-01" },
      { package_id: pkg2, sales_price: 1500000 },
    ],
  };
}

test("正常系: 複数PRODUCT", () => {
  const r = validateCreateDealerSalesPricesBody(validProductBody());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.items.length, 2);
    assert.equal(r.value.price_target_type, "PRODUCT");
  }
});

test("正常系: 複数PACKAGE", () => {
  const r = validateCreateDealerSalesPricesBody(validPackageBody());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.price_target_type, "PACKAGE");
    assert.equal(r.value.items[0].package_id, pkg1);
    assert.equal(r.value.items[0].product_id, undefined);
  }
});

test("販売店必須", () => {
  const body = validProductBody();
  body.dealer_id = "";
  assert.equal(validateCreateDealerSalesPricesBody(body).ok, false);
});

test("items 0件不可", () => {
  const body = validProductBody();
  body.items = [];
  assert.equal(validateCreateDealerSalesPricesBody(body).ok, false);
});

test("同一 product_id 重複不可", () => {
  const body = validProductBody();
  body.items[1].product_id = p1;
  const r = validateCreateDealerSalesPricesBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(JSON.stringify(r.field_errors), /同じ商品/);
});

test("同一 package_id 重複不可", () => {
  const body = validPackageBody();
  body.items[1].package_id = pkg1;
  const r = validateCreateDealerSalesPricesBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(JSON.stringify(r.field_errors), /同じパッケージ/);
});

test("PACKAGE 時 product_id 混入拒否", () => {
  const r = validateCreateDealerSalesPricesBody({
    dealer_id: dealer,
    price_target_type: "PACKAGE",
    items: [{ package_id: pkg1, product_id: p1, sales_price: 1000 }],
  });
  assert.equal(r.ok, false);
});

test("PRODUCT 時 package_id 混入拒否", () => {
  const r = validateCreateDealerSalesPricesBody({
    dealer_id: dealer,
    items: [{ product_id: p1, package_id: pkg1, sales_price: 1000 }],
  });
  assert.equal(r.ok, false);
});

test("価格0以下不可", () => {
  const body = validProductBody();
  body.items[0].sales_price = 0;
  assert.equal(validateCreateDealerSalesPricesBody(body).ok, false);
});

test("RPC payload は target に応じて id を振り分け", () => {
  const validated = validateCreateDealerSalesPricesBody(validPackageBody());
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const payload = buildCreateDealerSalesPricesRpcPayload(
    "66666666-6666-4666-8666-666666666666",
    validated.value
  );
  assert.equal(payload.dealer_id, dealer);
  assert.equal(payload.price_target_type, "PACKAGE");
  const item0 = (payload.items as Record<string, unknown>[])[0];
  assert.equal(item0.package_id, pkg1);
  assert.equal(item0.product_id, null);
});

test("不正 product_id 拒否", () => {
  const body = validProductBody();
  body.items[0].product_id = "not-a-uuid";
  assert.equal(validateCreateDealerSalesPricesBody(body).ok, false);
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
