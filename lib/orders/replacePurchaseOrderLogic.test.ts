/**
 * 発注編集: パッケージ行ガード + 同一トランザクション置換
 * Run: npx tsx lib/orders/replacePurchaseOrderLogic.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VE_PKG_AMT_PREFIX,
  VE_PKG_COMP_PREFIX,
  buildOrderDisplayLines,
  buildPackageAmountMemo,
  buildPackageComponentMemo,
  canDeleteOrderEditLine,
  canEditOrderLineUnitPrice,
  displaySafeOrderItemMemo,
} from "./orderPackageDisplay";
import {
  applyReplacePurchaseOrderTransaction,
  lineAmountForOrderEdit,
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

const existing = [
  {
    id: "amt-1",
    product_id: "p-amt",
    quantity: 1,
    unit_price: 132000,
    amount: 132000,
    memo: AMT_MEMO,
    sort_order: 0,
  },
  {
    id: "comp-1",
    product_id: "p-comp",
    quantity: 1,
    unit_price: 0,
    amount: 0,
    memo: COMP_MEMO,
    sort_order: 1,
  },
  {
    id: "prod-1",
    product_id: "p-prod",
    quantity: 1,
    unit_price: 10000,
    amount: 10000,
    memo: "通常",
    sort_order: 2,
  },
];

check("package AMT行を個別削除できない", () => {
  assert.equal(canDeleteOrderEditLine(AMT_MEMO), false);
  const r = validateReplacePurchaseOrderItems(existing, [
    { id: "comp-1", product_id: "p-comp", quantity: 1, unit_price: 0, memo: COMP_MEMO },
    { id: "prod-1", product_id: "p-prod", quantity: 1, unit_price: 10000, memo: "通常" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected fail");
  assert.match(r.error_message, /パッケージ金額行は削除できません/);
});

check("package COMP行を個別削除できない", () => {
  assert.equal(canDeleteOrderEditLine(COMP_MEMO), false);
  const r = validateReplacePurchaseOrderItems(existing, [
    { id: "amt-1", product_id: "p-amt", quantity: 1, unit_price: 132000, memo: AMT_MEMO },
    { id: "prod-1", product_id: "p-prod", quantity: 1, unit_price: 10000, memo: "通常" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected fail");
  assert.match(r.error_message, /パッケージ構成行は削除できません/);
});

check("package COMP行のunit_priceを変更できない（0円へ正規化）", () => {
  assert.equal(canEditOrderLineUnitPrice(COMP_MEMO), false);
  const r = validateReplacePurchaseOrderItems(existing, [
    { id: "amt-1", product_id: "p-amt", quantity: 1, unit_price: 132000, memo: AMT_MEMO },
    {
      id: "comp-1",
      product_id: "p-comp",
      quantity: 1,
      unit_price: 99999,
      memo: COMP_MEMO,
    },
    { id: "prod-1", product_id: "p-prod", quantity: 1, unit_price: 10000, memo: "通常" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected ok");
  const comp = r.items.find((i) => i.id === "comp-1");
  assert.ok(comp);
  assert.equal(comp!.unit_price, 0);
  assert.equal(comp!.amount, 0);
  assert.equal(lineAmountForOrderEdit({ memo: COMP_MEMO, quantity: 1, unit_price: 99999 }), 0);
});

check("package金額が二重計上されない", () => {
  const r = validateReplacePurchaseOrderItems(existing, [
    { id: "amt-1", product_id: "p-amt", quantity: 1, unit_price: 132000, memo: AMT_MEMO },
    {
      id: "comp-1",
      product_id: "p-comp",
      quantity: 2,
      unit_price: 50000,
      memo: COMP_MEMO,
    },
    { id: "prod-1", product_id: "p-prod", quantity: 1, unit_price: 10000, memo: "通常" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected ok");
  assert.equal(r.orderAmount, 142000);
  assert.equal(
    r.items.reduce((sum, item) => sum + item.amount, 0),
    r.items.find((i) => i.id === "amt-1")!.amount +
      r.items.find((i) => i.id === "prod-1")!.amount
  );
});

check("通常商品は追加・削除・単価変更できる", () => {
  const r = validateReplacePurchaseOrderItems(existing, [
    { id: "amt-1", product_id: "p-amt", quantity: 1, unit_price: 132000, memo: AMT_MEMO },
    { id: "comp-1", product_id: "p-comp", quantity: 1, unit_price: 0, memo: COMP_MEMO },
    { id: null, product_id: "p-new", quantity: 2, unit_price: 3000, memo: "追加" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected ok");
  assert.equal(r.items.length, 3);
  assert.equal(r.orderAmount, 132000 + 6000);
  assert.equal(canDeleteOrderEditLine("追加"), true);
  assert.equal(canEditOrderLineUnitPrice("追加"), true);
});

check("item insert失敗時は header / order_amount / order_items がROLLBACKされる", () => {
  const store = {
    order: {
      id: "ord-1",
      order_amount: 142000,
      expected_delivery_date: "2026-08-01",
      delivered_date: null,
      status: "発注済",
      memo: "元",
    },
    items: existing.map((row) => ({
      ...row,
      case_product_id: null,
    })),
  };
  const result = applyReplacePurchaseOrderTransaction(
    store,
    {
      header: {
        status: "納品済",
        delivered_date: "2026-08-10",
        expected_delivery_date: "2026-08-01",
        memo: "更新途中",
      },
      items: [
        { id: "amt-1", product_id: "p-amt", quantity: 1, unit_price: 200000, memo: AMT_MEMO },
        { id: "comp-1", product_id: "p-comp", quantity: 1, unit_price: 0, memo: COMP_MEMO },
        { id: "prod-1", product_id: "p-prod", quantity: 1, unit_price: 1, memo: "通常" },
      ],
    },
    { failAt: "insert" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.store.order.order_amount, 142000);
  assert.equal(result.store.order.status, "発注済");
  assert.equal(result.store.order.memo, "元");
  assert.equal(result.store.order.delivered_date, null);
  assert.deepEqual(
    result.store.items.map((i) => ({ id: i.id, amount: i.amount, unit_price: i.unit_price })),
    existing.map((i) => ({ id: i.id, amount: i.amount, unit_price: i.unit_price }))
  );
});

check("既存package displayで内部マーカーが表示されない", () => {
  const lines = buildOrderDisplayLines(
    existing.map((row) => ({
      ...row,
      case_product_id: null,
      product_name: row.id,
    }))
  );
  const text = JSON.stringify(lines);
  assert.ok(!text.includes(VE_PKG_AMT_PREFIX));
  assert.ok(!text.includes(VE_PKG_COMP_PREFIX));
  assert.equal(displaySafeOrderItemMemo(AMT_MEMO), "");
  assert.equal(displaySafeOrderItemMemo(COMP_MEMO), "");
});

check("編集画面は replace_purchase_order を使い逐次DELETE/INSERTしない", () => {
  const src = readFileSync(
    join(process.cwd(), "app/orders/[id]/edit/page.tsx"),
    "utf8"
  );
  assert.equal(src.includes("replaceOrderItemsForOrder"), false);
  assert.ok(src.includes("replace_purchase_order"));
});

check("RPC SQL はヘッダ更新・明細置換を同一関数内に置き EXCEPTION でROLLBACKする", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260818050000_replace_purchase_order_rpc.sql"
    ),
    "utf8"
  );
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.replace_purchase_order"));
  assert.ok(sql.includes("SET search_path = pg_catalog, public"));
  assert.ok(sql.includes("UPDATE public.orders"));
  assert.ok(sql.includes("DELETE FROM public.order_items"));
  assert.ok(sql.includes("INSERT INTO public.order_items"));
  assert.ok(sql.includes("EXCEPTION"));
  assert.ok(!sql.includes("CREATE TABLE"));
});

check("RPC SQL は自由入力 [VE_CUSTOM] を product_id なしで許可する", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260818100000_replace_purchase_order_custom_lines.sql"
    ),
    "utf8"
  );
  assert.ok(sql.includes("[VE_CUSTOM]"));
  assert.ok(sql.includes("自由入力明細の明細名を入力してください。"));
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll replacePurchaseOrderLogic checks passed");
