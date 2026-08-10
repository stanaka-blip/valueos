/**
 * 3社間金銭 API validation ユニットテスト
 *
 * 実行: npx tsx lib/threeParty/moneyActionsLogic.test.ts
 */
import assert from "node:assert/strict";

import {
  buildThreePartyMoneyRpcPayload,
  hashMoneyActionPayload,
  validateMoneyActionInput,
} from "@/lib/threeParty/moneyActionsLogic";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const DEALER_ID = "33333333-3333-4333-8333-333333333333";
const SUPPLIER_ID = "44444444-4444-4444-8444-444444444444";
const ORDER_ID = "55555555-5555-4555-8555-555555555555";

test("信販入金 create を正規化できる", () => {
  const r = validateMoneyActionInput({
    action: "finance_receipt.create",
    caseId: CASE_ID,
    resourceId: null,
    body: {
      finance_company: "オリコ",
      scheduled_date: "2026-08-20",
      scheduled_amount: 2340000,
      memo: "完工後",
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.action, "finance_receipt.create");
  assert.equal(r.value.payload.scheduled_amount, 2340000);
});

test("仕切 create は payout を計算する (novis例)", () => {
  const r = validateMoneyActionInput({
    action: "dealer_settlement.create",
    caseId: CASE_ID,
    resourceId: null,
    body: {
      dealer_id: DEALER_ID,
      credit_received_amount: 2340000,
      ve_share_amount: 916300,
      lines: [
        {
          line_kind: "transfer_fee",
          description: "振込手数料",
          amount: 550,
        },
      ],
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.action, "dealer_settlement.create");
  assert.equal(r.value.payload.payout_amount, 1423150);
  assert.equal(r.value.payload.adjustment_total_amount, 550);
});

test("確定済み金額の直接UPDATE用アクションは存在しない（confirm は body 金額なし）", () => {
  const r = validateMoneyActionInput({
    action: "dealer_settlement.confirm",
    caseId: null,
    resourceId: RESOURCE_ID,
    body: { credit_received_amount: 1 },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value.payload, {});
});

test("仕入先支払 create は order 1:N（order_id 任意）かつ信販前提なし", () => {
  const withOrder = validateMoneyActionInput({
    action: "supplier_payment.create",
    caseId: CASE_ID,
    resourceId: null,
    body: {
      supplier_id: SUPPLIER_ID,
      order_id: ORDER_ID,
      due_date: "2026-09-30",
      scheduled_amount: 500000,
    },
  });
  assert.equal(withOrder.ok, true);

  const withoutOrder = validateMoneyActionInput({
    action: "supplier_payment.create",
    caseId: CASE_ID,
    resourceId: null,
    body: {
      supplier_id: SUPPLIER_ID,
      scheduled_amount: 100000,
    },
  });
  assert.equal(withoutOrder.ok, true);
});

test("負の調整額は拒否", () => {
  const r = validateMoneyActionInput({
    action: "dealer_settlement.create",
    caseId: CASE_ID,
    resourceId: null,
    body: {
      dealer_id: DEALER_ID,
      credit_received_amount: 1000,
      ve_share_amount: 100,
      lines: [
        { line_kind: "transfer_fee", description: "fee", amount: -1 },
      ],
    },
  });
  assert.equal(r.ok, false);
});

test("payout < 0 は拒否", () => {
  const r = validateMoneyActionInput({
    action: "dealer_settlement.create",
    caseId: CASE_ID,
    resourceId: null,
    body: {
      dealer_id: DEALER_ID,
      credit_received_amount: 100,
      ve_share_amount: 200,
      lines: [],
    },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.field_errors?.payout_amount != null, true);
});

test("RPC payload に request_id/action を注入し client request_id を使わない", () => {
  const r = validateMoneyActionInput({
    action: "finance_receipt.create",
    caseId: CASE_ID,
    resourceId: null,
    body: {
      request_id: "should-be-ignored",
      finance_company: "オリコ",
      scheduled_amount: 1,
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const payload = buildThreePartyMoneyRpcPayload(RESOURCE_ID, r.value);
  assert.equal(payload.request_id, RESOURCE_ID);
  assert.equal(payload.action, "finance_receipt.create");
  assert.equal(payload.case_id, CASE_ID);
  assert.notEqual(String(payload.request_id), "should-be-ignored");
});

test("payload hash はキー順に安定", () => {
  const a = validateMoneyActionInput({
    action: "finance_receipt.cancel",
    caseId: null,
    resourceId: RESOURCE_ID,
    body: { cancel_reason: "誤登録" },
  });
  const b = validateMoneyActionInput({
    action: "finance_receipt.cancel",
    caseId: null,
    resourceId: RESOURCE_ID,
    body: { cancel_reason: "誤登録" },
  });
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(hashMoneyActionPayload(a.value), hashMoneyActionPayload(b.value));
});

test("訂正 payload は create 相当 + cancel_reason", () => {
  const r = validateMoneyActionInput({
    action: "finance_receipt.correct",
    caseId: null,
    resourceId: RESOURCE_ID,
    body: {
      finance_company: "アプラス",
      scheduled_amount: 100,
      cancel_reason: "金額誤り",
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.action, "finance_receipt.correct");
  if (r.value.action !== "finance_receipt.correct") return;
  assert.equal(r.value.payload.cancel_reason, "金額誤り");
  assert.equal(r.value.payload.finance_company, "アプラス");
});

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`\n${failed}/${tests.length} failed`);
  process.exit(1);
}
console.log(`\n${tests.length}/${tests.length} passed`);
