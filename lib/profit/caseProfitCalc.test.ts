/**
 * 案件粗利 v1 ユニットテスト
 *
 * 実行: npx tsx lib/profit/caseProfitCalc.test.ts
 */
import assert from "node:assert/strict";

import {
  computeConfirmedCaseProfit,
  computeForecastCaseProfit,
  resolveCaseProfitFee,
  sumActiveInvoiceRevenue,
  sumActiveOrderCost,
} from "@/lib/profit/caseProfitCalc";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("手数料: fee_amount 優先", () => {
  assert.equal(
    resolveCaseProfitFee({ feeAmount: 5000, feeRate: 10 }, 100000),
    5000
  );
});

test("手数料: fee_amount 無しなら rate × 売上", () => {
  assert.equal(resolveCaseProfitFee({ feeAmount: 0, feeRate: 3 }, 100000), 3000);
});

test("確定粗利: 請求 − 発注 − 手数料（通常決済）", () => {
  const r = computeConfirmedCaseProfit({
    invoices: [
      { status: "発行済", invoiceAmount: 1_000_000 },
      { status: "取消", invoiceAmount: 999_999 },
    ],
    orders: [
      { status: "発注済", orderAmount: 600_000 },
      { status: "キャンセル", orderAmount: 50_000 },
    ],
    fee: { feeAmount: 10_000 },
  });
  assert.equal(r.revenue, 1_000_000);
  assert.equal(r.cost, 600_000);
  assert.equal(r.fee, 10_000);
  assert.equal(r.profit, 390_000);
});

test("VE-1786852027168相当: finance 400万・仕切257万があっても売上はinvoice 143万のまま", () => {
  const financeReceipts = [{ actual_amount: 4_000_000, status: "入金済" }];
  const dealerSettlements = [{ payout_amount: 2_570_000, status: "確定" }];
  const payments = [{ payment_amount: 4_000_000, status: "取消" }]; // 顧客入金は粗利入力に使わない

  const r = computeConfirmedCaseProfit({
    invoices: [{ status: "発行済", invoiceAmount: 1_430_000 }],
    orders: [{ status: "発注済", orderAmount: 800_000 }],
    fee: { feeAmount: 0, feeRate: null },
  });

  assert.equal(r.revenue, 1_430_000);
  assert.equal(r.revenue, 1_430_000);
  assert.notEqual(r.revenue, financeReceipts[0].actual_amount);
  assert.notEqual(r.cost, dealerSettlements[0].payout_amount);
  assert.equal(r.profit, 630_000);
  // CF 台帳は関数引数外＝二重計上不可（存在していても売上は請求のまま）
  assert.equal(financeReceipts[0].actual_amount, 4_000_000);
  assert.equal(dealerSettlements[0].payout_amount, 2_570_000);
  assert.equal(payments[0].payment_amount, 4_000_000);
});

test("3社間: 信販・仕切・顧客入金を売上/原価に使わない（入力に含めない設計）", () => {
  const r = computeConfirmedCaseProfit({
    invoices: [
      { status: "発行済", invoiceAmount: 1_430_000 },
      { status: "取消", invoiceAmount: 4_000_000 },
    ],
    orders: [{ status: "発注済", orderAmount: 900_000 }],
    fee: { feeRate: 0 },
  });
  assert.equal(sumActiveInvoiceRevenue([{ status: "発行済", invoiceAmount: 1_430_000 }]), 1_430_000);
  assert.equal(sumActiveOrderCost([{ status: "発注済", orderAmount: 900_000 }]), 900_000);
  assert.equal(r.revenue, 1_430_000);
  assert.equal(r.cost, 900_000);
  assert.equal(r.profit, 530_000);
});

test("見込粗利: 価格NULLは hasUnsetPrices", () => {
  const r = computeForecastCaseProfit({
    products: [
      { salesPrice: 100_000, purchasePrice: 60_000 },
      { salesPrice: null, purchasePrice: 10_000 },
    ],
    fee: { feeAmount: 0 },
  });
  assert.equal(r.hasUnsetPrices, true);
  assert.equal(r.revenue, 100_000);
  assert.equal(r.cost, 70_000);
  assert.equal(r.profit, 30_000);
});

test("見込粗利: 全価格ありなら unset なし", () => {
  const r = computeForecastCaseProfit({
    products: [{ salesPrice: 200_000, purchasePrice: 120_000 }],
    fee: { feeRate: 5 },
  });
  assert.equal(r.hasUnsetPrices, false);
  assert.equal(r.fee, 10_000);
  assert.equal(r.profit, 70_000);
});

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok - ${t.name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL - ${t.name}`);
    console.error(e);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
console.log("caseProfitCalc.test.ts: ok");
