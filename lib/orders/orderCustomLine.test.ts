/**
 * 発注自由入力明細
 * Run: npx tsx lib/orders/orderCustomLine.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VE_CUSTOM_PREFIX,
  buildCustomOrderItemMemo,
  isCustomOrderLine,
  parseCustomOrderItemMemo,
  validateCustomOrderItemMemo,
} from "./orderCustomLine";
import {
  VE_PKG_AMT_PREFIX,
  VE_PKG_COMP_PREFIX,
  buildDeliveryQuantityLines,
  buildOrderDisplayLines,
  buildPackageAmountMemo,
  buildPackageComponentMemo,
  canDeleteOrderEditLine,
  displaySafeOrderItemMemo,
} from "./orderPackageDisplay";
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

const PKG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AMT_MEMO = buildPackageAmountMemo({
  casePackageId: PKG_ID,
  packageName: "PKG",
  packageQty: 1,
});
const COMP_MEMO = buildPackageComponentMemo(PKG_ID);

const shippingMemo = buildCustomOrderItemMemo({
  manufacturer: "その他",
  lineName: "配送料",
  userMemo: "メーカー直送送料",
});

check("A: 新規自由入力 その他/配送料 1×30000=30000", () => {
  const r = validateReplacePurchaseOrderItems([], [
    {
      id: null,
      product_id: null,
      quantity: 1,
      unit_price: 30_000,
      memo: shippingMemo,
    },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected ok");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].product_id, null);
  assert.equal(r.items[0].case_product_id, null);
  assert.equal(r.items[0].quantity, 1);
  assert.equal(r.items[0].unit_price, 30_000);
  assert.equal(r.items[0].amount, 30_000);
  assert.equal(r.orderAmount, 30_000);
});

check("B: order_amount 1,600,000 + 30,000 = 1,630,000", () => {
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
      memo: shippingMemo,
    },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected ok");
  assert.equal(r.orderAmount, 1_630_000);
  const custom = r.items.find((i) => isCustomOrderLine(i.memo));
  assert.ok(custom);
  assert.equal(custom!.amount, 30_000);
});

check("C: 再読込で区分・明細名・数量・単価・備考が復元される", () => {
  const parsed = parseCustomOrderItemMemo(shippingMemo);
  assert.ok(parsed);
  const saved = {
    product_id: null,
    quantity: 1,
    unit_price: 30_000,
    amount: 30_000,
    memo: shippingMemo,
  };
  assert.equal(parsed!.manufacturer, "その他");
  assert.equal(parsed!.lineName, "配送料");
  assert.equal(parsed!.userMemo, "メーカー直送送料");
  assert.equal(saved.quantity, 1);
  assert.equal(saved.unit_price, 30_000);
});

check("D: 自由入力を編集して再保存できる", () => {
  const existing = [
    {
      id: "c1",
      product_id: null,
      quantity: 1,
      unit_price: 30_000,
      amount: 30_000,
      memo: shippingMemo,
      sort_order: 0,
    },
  ];
  const r = validateReplacePurchaseOrderItems(existing, [
    {
      id: "c1",
      product_id: null,
      quantity: 2,
      unit_price: 15_000,
      custom_line_name: "送料",
      custom_manufacturer: "その他",
      custom_user_memo: "変更後",
    },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected ok");
  assert.equal(r.items[0].quantity, 2);
  assert.equal(r.items[0].unit_price, 15_000);
  assert.equal(r.items[0].amount, 30_000);
  const parsed = parseCustomOrderItemMemo(r.items[0].memo);
  assert.ok(parsed);
  assert.equal(parsed!.lineName, "送料");
  assert.equal(parsed!.userMemo, "変更後");
});

check("E: 自由入力は削除可、package AMT/COMP は削除不可", () => {
  assert.equal(canDeleteOrderEditLine(shippingMemo), true);
  assert.equal(canDeleteOrderEditLine(AMT_MEMO), false);
  assert.equal(canDeleteOrderEditLine(COMP_MEMO), false);
  const existing = [
    {
      id: "amt-1",
      product_id: "p-amt",
      quantity: 1,
      unit_price: 132000,
      memo: AMT_MEMO,
    },
    {
      id: "comp-1",
      product_id: "p-comp",
      quantity: 1,
      unit_price: 0,
      memo: COMP_MEMO,
    },
    {
      id: "c1",
      product_id: null,
      quantity: 1,
      unit_price: 30_000,
      memo: shippingMemo,
    },
  ];
  const removedCustom = validateReplacePurchaseOrderItems(existing, [
    { id: "amt-1", product_id: "p-amt", quantity: 1, unit_price: 132000, memo: AMT_MEMO },
    { id: "comp-1", product_id: "p-comp", quantity: 1, unit_price: 0, memo: COMP_MEMO },
  ]);
  assert.equal(removedCustom.ok, true);
  if (!removedCustom.ok) throw new Error("expected ok");
  assert.equal(removedCustom.items.length, 2);
  assert.equal(removedCustom.orderAmount, 132000);

  const removedAmt = validateReplacePurchaseOrderItems(existing, [
    { id: "comp-1", product_id: "p-comp", quantity: 1, unit_price: 0, memo: COMP_MEMO },
    { id: "c1", product_id: null, quantity: 1, unit_price: 30_000, memo: shippingMemo },
  ]);
  assert.equal(removedAmt.ok, false);
});

check("F: 明細名空 / quantity 0 / 負 / unit_price 負は拒否", () => {
  assert.equal(
    validateReplacePurchaseOrderItems([], [
      { id: null, product_id: null, quantity: 1, unit_price: 1000, memo: "[VE_CUSTOM]|その他||" },
    ]).ok,
    false
  );
  assert.equal(
    validateReplacePurchaseOrderItems([], [
      { id: null, product_id: null, quantity: 0, unit_price: 1000, memo: shippingMemo },
    ]).ok,
    false
  );
  assert.equal(
    validateReplacePurchaseOrderItems([], [
      { id: null, product_id: null, quantity: -1, unit_price: 1000, memo: shippingMemo },
    ]).ok,
    false
  );
  assert.equal(
    validateReplacePurchaseOrderItems([], [
      { id: null, product_id: null, quantity: 1, unit_price: -1, memo: shippingMemo },
    ]).ok,
    false
  );
});

check("G: product_id null は正しい [VE_CUSTOM] だけ許可（新規・既存）", () => {
  assert.equal(
    validateReplacePurchaseOrderItems([], [
      { id: null, product_id: null, quantity: 1, unit_price: 1000, memo: "通常" },
    ]).ok,
    false
  );
  assert.equal(
    validateReplacePurchaseOrderItems([], [
      { id: null, product_id: null, quantity: 1, unit_price: 1000, memo: "[VE_CUSTOM]" },
    ]).ok,
    false
  );
  const existing = [
    {
      id: "c1",
      product_id: null,
      quantity: 1,
      unit_price: 30_000,
      memo: shippingMemo,
    },
  ];
  assert.equal(
    validateReplacePurchaseOrderItems(existing, [
      { id: "c1", product_id: null, quantity: 1, unit_price: 30_000, memo: "通常" },
    ]).ok,
    false
  );
  assert.equal(
    validateReplacePurchaseOrderItems(existing, [
      { id: "c1", product_id: null, quantity: 1, unit_price: 30_000, memo: "[VE_CUSTOM]" },
    ]).ok,
    false
  );
  const okExisting = validateReplacePurchaseOrderItems(existing, [
    { id: "c1", product_id: null, quantity: 1, unit_price: 30_000, memo: shippingMemo },
  ]);
  assert.equal(okExisting.ok, true);
});

check("H: package marker と混同せず内部markerを表示しない", () => {
  assert.equal(isCustomOrderLine(AMT_MEMO), false);
  assert.equal(isCustomOrderLine(COMP_MEMO), false);
  assert.equal(isCustomOrderLine("通常備考"), false);
  const lines = buildOrderDisplayLines([
    {
      id: "c1",
      product_id: null,
      case_product_id: null,
      quantity: 1,
      unit_price: 30_000,
      amount: 30_000,
      memo: shippingMemo,
      sort_order: 0,
    },
  ]);
  const text = JSON.stringify(lines);
  assert.ok(!text.includes(VE_CUSTOM_PREFIX));
  assert.ok(!text.includes(VE_PKG_AMT_PREFIX));
  assert.ok(!text.includes(VE_PKG_COMP_PREFIX));
  assert.equal(displaySafeOrderItemMemo(shippingMemo), "メーカー直送送料");
});

check("I: | 入力は ／ に正規化され再読込しても構造が壊れない", () => {
  const memo = buildCustomOrderItemMemo({
    manufacturer: "配送|その他",
    lineName: "配送|設置費",
    userMemo: "札幌|現場",
  });
  const parsed = parseCustomOrderItemMemo(memo);
  assert.ok(parsed);
  assert.equal(parsed!.manufacturer, "配送／その他");
  assert.equal(parsed!.lineName, "配送／設置費");
  assert.equal(parsed!.userMemo, "札幌／現場");
  const again = parseCustomOrderItemMemo(
    buildCustomOrderItemMemo(parsed!)
  );
  assert.deepEqual(again, parsed);
  assert.equal((memo.match(/\|/g) || []).length, 3);
});

check("J: 自由入力は納品数量対象外、通常商品・package構成は残る", () => {
  const items = [
    {
      id: "amt",
      product_id: "p-amt",
      case_product_id: null,
      quantity: 1,
      unit_price: 132000,
      amount: 132000,
      memo: AMT_MEMO,
      sort_order: 0,
    },
    {
      id: "comp",
      product_id: "p-comp",
      case_product_id: null,
      quantity: 3,
      unit_price: 0,
      amount: 0,
      memo: COMP_MEMO,
      sort_order: 1,
    },
    {
      id: "prod",
      product_id: "p3",
      case_product_id: "cp",
      quantity: 1,
      unit_price: 1_600_000,
      amount: 1_600_000,
      memo: null,
      sort_order: 2,
    },
    {
      id: "ship",
      product_id: null,
      case_product_id: null,
      quantity: 1,
      unit_price: 30_000,
      amount: 30_000,
      memo: shippingMemo,
      sort_order: 3,
    },
  ];
  const qty = buildDeliveryQuantityLines(items);
  assert.equal(qty.length, 2);
  assert.equal(qty[0].id, "comp");
  assert.equal(qty[1].id, "prod");
  assert.ok(!qty.some((i) => isCustomOrderLine(i.memo)));
  assert.ok(!qty.some((i) => i.id === "amt"));

  const amount = validateReplacePurchaseOrderItems(
    items.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      quantity: row.quantity,
      unit_price: row.unit_price,
      memo: row.memo,
    })),
    items.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      quantity: row.quantity,
      unit_price: row.unit_price,
      memo: row.memo,
    }))
  );
  assert.equal(amount.ok, true);
  if (!amount.ok) throw new Error("expected ok");
  assert.equal(amount.orderAmount, 1_762_000);
});

check("RPC SQL は product_id null を id 有無で分けない", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260818100000_replace_purchase_order_custom_lines.sql"
    ),
    "utf8"
  );
  assert.ok(sql.includes("IF NULLIF(btrim(v_item->>'product_id'), '') IS NULL THEN"));
  assert.equal(sql.includes("IF v_item_id IS NULL AND NULLIF(btrim(v_item->>'product_id')"), false);
  assert.ok(sql.includes("[VE_CUSTOM]|%"));
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll orderCustomLine checks passed");
