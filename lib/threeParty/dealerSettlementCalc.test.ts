/**
 * 仕切計算ユニットテスト
 *
 * 実行: npx tsx lib/threeParty/dealerSettlementCalc.test.ts
 */
import assert from "node:assert/strict";

import {
  calculateDealerSettlementPayout,
  suggestedDealerPayoutFromFinance,
  sumActiveInvoiceAmounts,
  sumDealerSettlementAdjustments,
  toDealerSettlementAmountSnapshot,
} from "@/lib/threeParty/dealerSettlementCalc";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("novis例: 2340000 - 916300 - 550 = 1423150", () => {
  const r = calculateDealerSettlementPayout({
    creditReceivedAmount: 2340000,
    veShareAmount: 916300,
    adjustmentLines: [
      { line_kind: "transfer_fee", amount: 550 },
    ],
  });
  assert.equal(r.creditReceivedAmount, 2340000);
  assert.equal(r.veShareAmount, 916300);
  assert.equal(r.adjustmentTotalAmount, 550);
  assert.equal(r.payoutAmount, 1423150);
});

test("複数調整（手数料+値引+相殺）", () => {
  const r = calculateDealerSettlementPayout({
    creditReceivedAmount: 1000000,
    veShareAmount: 200000,
    adjustmentLines: [
      { line_kind: "transfer_fee", amount: 550 },
      { line_kind: "discount", amount: 10000 },
      { line_kind: "offset", amount: 5000 },
      { line_kind: "other", amount: 450 },
    ],
  });
  assert.equal(r.adjustmentTotalAmount, 16000);
  assert.equal(r.payoutAmount, 784000);
});

test("credit_in / ve_share 行は調整合計に含めない", () => {
  const sum = sumDealerSettlementAdjustments([
    { line_kind: "credit_in", amount: 2340000 },
    { line_kind: "ve_share", amount: 916300 },
    { line_kind: "transfer_fee", amount: 550 },
  ]);
  assert.equal(sum, 550);
});

test("調整なしでも成立", () => {
  const r = calculateDealerSettlementPayout({
    creditReceivedAmount: 100,
    veShareAmount: 40,
  });
  assert.equal(r.adjustmentTotalAmount, 0);
  assert.equal(r.payoutAmount, 60);
});

test("snapshot 列名へ写せる", () => {
  const snap = toDealerSettlementAmountSnapshot(
    calculateDealerSettlementPayout({
      creditReceivedAmount: 2340000,
      veShareAmount: 916300,
      adjustmentLines: [{ line_kind: "transfer_fee", amount: 550 }],
    })
  );
  assert.deepEqual(snap, {
    credit_received_amount: 2340000,
    ve_share_amount: 916300,
    adjustment_total_amount: 550,
    payout_amount: 1423150,
  });
});

test("端数は floor してから演算", () => {
  const r = calculateDealerSettlementPayout({
    creditReceivedAmount: 1000.9,
    veShareAmount: 100.1,
    adjustmentLines: [{ line_kind: "transfer_fee", amount: 10.9 }],
  });
  assert.equal(r.creditReceivedAmount, 1000);
  assert.equal(r.veShareAmount, 100);
  assert.equal(r.adjustmentTotalAmount, 10);
  assert.equal(r.payoutAmount, 890);
});

test("VE-1786852027168例: 信販180万と商品請求143万は別物で仕切初期37万", () => {
  const invoiceTotal = sumActiveInvoiceAmounts([
    { status: "請求済", invoiceAmount: 1_430_000 },
    { status: "取消", invoiceAmount: 999_999 },
  ]);
  assert.equal(invoiceTotal, 1_430_000);

  const financeAmount = 1_800_000;
  const suggested = suggestedDealerPayoutFromFinance({
    financeAmount,
    invoiceTotalAmount: invoiceTotal,
  });
  assert.equal(suggested, 370_000);

  const r = calculateDealerSettlementPayout({
    creditReceivedAmount: financeAmount,
    veShareAmount: invoiceTotal,
    adjustmentLines: [{ line_kind: "transfer_fee", amount: 0 }],
  });
  assert.equal(r.payoutAmount, 370_000);
  assert.equal(r.adjustmentTotalAmount, 0);
});

test("仕切初期額は transfer_fee を自動控除しない", () => {
  assert.equal(
    suggestedDealerPayoutFromFinance({
      financeAmount: 1_000_000,
      invoiceTotalAmount: 400_000,
    }),
    600_000
  );
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
