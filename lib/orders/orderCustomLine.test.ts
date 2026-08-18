/**
 * 発注自由入力明細
 * Run: npx tsx lib/orders/orderCustomLine.test.ts
 */
import assert from "node:assert/strict";

import {
  VE_CUSTOM_PREFIX,
  buildCustomOrderItemMemo,
  isCustomOrderLine,
  parseCustomOrderItemMemo,
  validateCustomOrderItemMemo,
} from "./orderCustomLine";
import { buildOrderDisplayLines } from "./orderPackageDisplay";
import {
  validateReplacePurchaseOrderItems,
} from "./replacePurchaseOrderLogic";

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

check("自由入力 memo をエンコード・復号できる", () => {
  const memo = buildCustomOrderItemMemo({
    manufacturer: "その他",
    lineName: "配送料",
    userMemo: "メーカー直送送料",
  });
  assert.ok(isCustomOrderLine(memo));
  const parsed = parseCustomOrderItemMemo(memo);
  assert.ok(parsed);
  assert.equal(parsed!.manufacturer, "その他");
  assert.equal(parsed!.lineName, "配送料");
  assert.equal(parsed!.userMemo, "メーカー直送送料");
});

check("パッケージマーカーと混同しない", () => {
  assert.equal(isCustomOrderLine("[VE_PKG_AMT]|x|y|1"), false);
  assert.equal(isCustomOrderLine("[VE_PKG_COMP]|x"), false);
});

check("自由入力明細を追加すると発注金額に加算される", () => {
  const existing = [
    {
      id: "prod-1",
      product_id: "p1",
      quantity: 1,
      unit_price: 1_600_000,
      amount: 1_600_000,
      memo: "通常",
      sort_order: 0,
    },
  ];
  const memo = buildCustomOrderItemMemo({
    manufacturer: "その他",
    lineName: "配送料",
    userMemo: "",
  });
  const r = validateReplacePurchaseOrderItems(existing, [
    {
      id: "prod-1",
      product_id: "p1",
      quantity: 1,
      unit_price: 1_600_000,
      memo: "通常",
    },
    {
      id: null,
      product_id: null,
      quantity: 1,
      unit_price: 30_000,
      memo,
    },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected ok");
  assert.equal(r.orderAmount, 1_630_000);
  const custom = r.items.find((i) => isCustomOrderLine(i.memo));
  assert.ok(custom);
  assert.equal(custom!.product_id, null);
  assert.equal(custom!.amount, 30_000);
});

check("自由入力: 明細名空は保存不可", () => {
  const memo = buildCustomOrderItemMemo({
    manufacturer: "",
    lineName: "",
    userMemo: "",
  });
  assert.equal(validateCustomOrderItemMemo(memo), "自由入力明細の明細名を入力してください。");
  const r = validateReplacePurchaseOrderItems([], [
    {
      id: null,
      product_id: null,
      quantity: 1,
      unit_price: 1000,
      memo,
    },
  ]);
  assert.equal(r.ok, false);
});

check("自由入力明細は詳細表示に内部マーカーを出さない", () => {
  const memo = buildCustomOrderItemMemo({
    manufacturer: "その他",
    lineName: "配送料",
    userMemo: "送料",
  });
  const lines = buildOrderDisplayLines([
    {
      id: "c1",
      product_id: null,
      case_product_id: null,
      quantity: 1,
      unit_price: 30_000,
      amount: 30_000,
      memo,
      sort_order: 0,
    },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "PRODUCT");
  if (lines[0].kind !== "PRODUCT") throw new Error("expected product line");
  assert.equal(lines[0].manufacturer_name, "その他");
  assert.equal(lines[0].model_no, "配送料");
  assert.equal(lines[0].amount, 30_000);
  const text = JSON.stringify(lines);
  assert.ok(!text.includes(VE_CUSTOM_PREFIX));
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll orderCustomLine checks passed");
