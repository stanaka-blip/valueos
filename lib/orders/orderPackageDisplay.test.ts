/**
 * パッケージ発注表示: AMT/COMP マーカー再構成
 * Run: npx tsx lib/orders/orderPackageDisplay.test.ts
 */
import assert from "node:assert/strict";

import {
  buildDeliveryQuantityLines,
  buildOrderDisplayLines,
  buildPackageAmountMemo,
  buildPackageComponentMemo,
  parsePackageAmountMemo,
} from "./orderPackageDisplay";

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

const PKG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

check("memo parse: AMT", () => {
  const memo = buildPackageAmountMemo({
    casePackageId: PKG_ID,
    packageName: "全負荷単機能11.1kwシステム",
    packageQty: 2,
  });
  const parsed = parsePackageAmountMemo(memo);
  assert.ok(parsed);
  assert.equal(parsed!.casePackageId, PKG_ID);
  assert.equal(parsed!.packageQty, 2);
  assert.match(parsed!.packageName, /全負荷/);
});

check("display: パッケージ132000×1 → 1行金額132000・構成は金額なし", () => {
  const lines = buildOrderDisplayLines([
    {
      id: "amt1",
      product_id: "p1",
      case_product_id: "cp1",
      quantity: 1,
      unit_price: 132000,
      amount: 132000,
      memo: buildPackageAmountMemo({
        casePackageId: PKG_ID,
        packageName: "全負荷単機能11.1kwシステム",
        packageQty: 1,
      }),
      sort_order: 0,
      product_name: "carrier",
    },
    {
      id: "c1",
      product_id: "p2",
      case_product_id: null,
      quantity: 1,
      unit_price: 0,
      amount: 0,
      memo: buildPackageComponentMemo(PKG_ID),
      sort_order: 1,
      manufacturer_name: "ニチコン",
      model_no: "ESS-U4M1",
      product_name: "ニチコン ESS-U4M1",
    },
    {
      id: "c2",
      product_id: "p3",
      case_product_id: null,
      quantity: 1,
      unit_price: 0,
      amount: 0,
      memo: buildPackageComponentMemo(PKG_ID),
      sort_order: 2,
      manufacturer_name: "ニチコン",
      model_no: "ESS-H2H1",
      product_name: "ニチコン ESS-H2H1",
    },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "PACKAGE");
  if (lines[0].kind !== "PACKAGE") throw new Error("kind");
  assert.equal(lines[0].amount, 132000);
  assert.equal(lines[0].unit_price, 132000);
  assert.equal(lines[0].quantity, 1);
  assert.equal(lines[0].components.length, 2);
  assert.equal(lines[0].components[0].quantity, 1);
});

check("display: パッケージ×2 → 金額264000", () => {
  const lines = buildOrderDisplayLines([
    {
      id: "amt1",
      product_id: "p1",
      case_product_id: null,
      quantity: 2,
      unit_price: 132000,
      amount: 264000,
      memo: buildPackageAmountMemo({
        casePackageId: PKG_ID,
        packageName: "PKG",
        packageQty: 2,
      }),
      sort_order: 0,
    },
    {
      id: "c1",
      product_id: "p2",
      case_product_id: null,
      quantity: 2,
      unit_price: 0,
      amount: 0,
      memo: buildPackageComponentMemo(PKG_ID),
      sort_order: 1,
      product_name: "構成",
    },
  ]);
  assert.equal(lines[0].kind, "PACKAGE");
  if (lines[0].kind !== "PACKAGE") throw new Error("kind");
  assert.equal(lines[0].amount, 264000);
  assert.equal(lines[0].unit_price, 132000);
  assert.equal(lines[0].quantity, 2);
});

check("display: 通常商品＋パッケージ合算表示", () => {
  const lines = buildOrderDisplayLines([
    {
      id: "p",
      product_id: "p1",
      case_product_id: "cp",
      quantity: 1,
      unit_price: 10000,
      amount: 10000,
      memo: null,
      sort_order: 0,
      product_name: "通常",
      manufacturer_name: "M",
      model_no: "X",
    },
    {
      id: "amt",
      product_id: "p2",
      case_product_id: null,
      quantity: 1,
      unit_price: 132000,
      amount: 132000,
      memo: buildPackageAmountMemo({
        casePackageId: PKG_ID,
        packageName: "PKG",
        packageQty: 1,
      }),
      sort_order: 1,
    },
    {
      id: "c",
      product_id: "p3",
      case_product_id: null,
      quantity: 1,
      unit_price: 0,
      amount: 0,
      memo: buildPackageComponentMemo(PKG_ID),
      sort_order: 2,
      product_name: "構成",
    },
  ]);
  assert.equal(lines.length, 2);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  assert.equal(total, 142000);
});

check("delivery: AMT行を除外し構成数量を残す", () => {
  const items = [
    {
      id: "amt",
      product_id: "p1",
      case_product_id: null,
      quantity: 1,
      unit_price: 132000,
      amount: 132000,
      memo: buildPackageAmountMemo({
        casePackageId: PKG_ID,
        packageName: "PKG",
        packageQty: 1,
      }),
      sort_order: 0,
    },
    {
      id: "c1",
      product_id: "p2",
      case_product_id: null,
      quantity: 3,
      unit_price: 0,
      amount: 0,
      memo: buildPackageComponentMemo(PKG_ID),
      sort_order: 1,
    },
    {
      id: "prod",
      product_id: "p3",
      case_product_id: "cp",
      quantity: 2,
      unit_price: 500,
      amount: 1000,
      memo: null,
      sort_order: 2,
    },
  ];
  const qty = buildDeliveryQuantityLines(items);
  assert.equal(qty.length, 2);
  assert.equal(qty[0].id, "c1");
  assert.equal(qty[0].quantity, 3);
  assert.equal(qty[1].id, "prod");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll orderPackageDisplay checks passed");
