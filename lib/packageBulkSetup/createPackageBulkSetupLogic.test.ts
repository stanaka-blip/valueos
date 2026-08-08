/**
 * 実行: npx tsx lib/packageBulkSetup/createPackageBulkSetupLogic.test.ts
 */
import assert from "node:assert/strict";

import {
  buildCreatePackageBulkSetupRpcPayload,
  validateCreatePackageBulkSetupBody,
} from "./createPackageBulkSetupLogic";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const manufacturer = "11111111-1111-4111-8111-111111111111";
const series = "22222222-2222-4222-8222-222222222222";
const p1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const p2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const supplier = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function validBody() {
  return {
    manufacturer_id: manufacturer,
    series_id: series,
    packages: [
      {
        name: "標準10kWh",
        capacity: 10,
        warranty_years: 15,
        default_supplier_id: supplier,
        is_active: true,
        items: [
          { product_id: p1, quantity: 1 },
          { product_id: p2, quantity: 2 },
        ],
      },
      {
        name: "標準15kWh",
        capacity: 15,
        items: [{ product_id: p1, quantity: 1 }],
      },
    ],
  };
}

test("正常系: 複数パッケージ", () => {
  const r = validateCreatePackageBulkSetupBody(validBody());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.packages.length, 2);
});

test("メーカー必須", () => {
  const body = validBody();
  body.manufacturer_id = "";
  assert.equal(validateCreatePackageBulkSetupBody(body).ok, false);
});

test("packages 0件不可", () => {
  const body = validBody();
  body.packages = [];
  assert.equal(validateCreatePackageBulkSetupBody(body).ok, false);
});

test("同一リクエスト内パッケージ名重複拒否", () => {
  const body = validBody();
  body.packages[1].name = "標準10kWh";
  const r = validateCreatePackageBulkSetupBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(JSON.stringify(r.field_errors), /同じパッケージ名/);
});

test("構成商品0件不可", () => {
  const body = validBody();
  body.packages[0].items = [];
  assert.equal(validateCreatePackageBulkSetupBody(body).ok, false);
});

test("同一パッケージ内 product_id 重複拒否", () => {
  const body = validBody();
  body.packages[0].items[1].product_id = p1;
  const r = validateCreatePackageBulkSetupBody(body);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(JSON.stringify(r.field_errors), /同じ商品/);
});

test("quantity <= 0 拒否", () => {
  const body = validBody();
  body.packages[0].items[0].quantity = 0;
  assert.equal(validateCreatePackageBulkSetupBody(body).ok, false);
});

test("不正 product_id 拒否", () => {
  const body = validBody();
  body.packages[0].items[0].product_id = "bad";
  assert.equal(validateCreatePackageBulkSetupBody(body).ok, false);
});

test("RPC payload に prices を含めない", () => {
  const validated = validateCreatePackageBulkSetupBody(validBody());
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const payload = buildCreatePackageBulkSetupRpcPayload(
    "66666666-6666-4666-8666-666666666666",
    validated.value
  );
  assert.equal(payload.manufacturer_id, manufacturer);
  assert.equal("purchase_prices" in payload, false);
  assert.equal("sales_prices" in payload, false);
  assert.ok(Array.isArray(payload.packages));
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
