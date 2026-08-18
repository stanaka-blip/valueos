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
  resolveInvoiceProfitTax,
  sumActiveInvoiceBilledInclusive,
  sumActiveInvoiceRevenue,
  sumActiveOrderCost,
} from "@/lib/profit/caseProfitCalc";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("手数料: fee_amount 優先（税抜額として扱う）", () => {
  assert.equal(
    resolveCaseProfitFee({ feeAmount: 5000, feeRate: 10 }, 100000),
    5000
  );
});

test("手数料: fee_amount 無しなら rate × 税抜売上", () => {
  assert.equal(resolveCaseProfitFee({ feeAmount: 0, feeRate: 3 }, 100000), 3000);
});

test("税スナップショットがあれば税抜売上に使う（税込請求額は維持）", () => {
  const parts = resolveInvoiceProfitTax({
    invoiceAmount: 1_100_000,
    subtotalExTax: 1_000_000,
    taxAmount: 100_000,
  });
  assert.equal(parts.billedInclusive, 1_100_000);
  assert.equal(parts.subtotalExTax, 1_000_000);
  assert.equal(parts.tax, 100_000);
});

test("スナップショット無しは floor(税込 / 1.1) を税抜売上にする", () => {
  const parts = resolveInvoiceProfitTax({ invoiceAmount: 1_430_000 });
  assert.equal(parts.billedInclusive, 1_430_000);
  assert.equal(parts.subtotalExTax, 1_300_000);
  assert.equal(parts.tax, 130_000);
});

test("確定粗利: 税抜売上 − 税抜仕入 − 税抜手数料", () => {
  const r = computeConfirmedCaseProfit({
    invoices: [
      {
        status: "発行済",
        invoiceAmount: 1_100_000,
        subtotalExTax: 1_000_000,
        taxAmount: 100_000,
      },
      { status: "取消", invoiceAmount: 999_999 },
    ],
    orders: [
      { status: "発注済", orderAmount: 600_000 },
      { status: "キャンセル", orderAmount: 50_000 },
    ],
    fee: { feeAmount: 10_000 },
  });
  assert.equal(r.billedInclusive, 1_100_000);
  assert.equal(r.tax, 100_000);
  assert.equal(r.revenue, 1_000_000);
  assert.equal(r.cost, 600_000);
  assert.equal(r.fee, 10_000);
  assert.equal(r.profit, 390_000);
  assert.equal(r.rate, 39);
});

test("VE-1786852027168相当: finance 400万・仕切257万があっても売上は税抜（請求143万税込）", () => {
  const financeReceipts = [{ actual_amount: 4_000_000, status: "入金済" }];
  const dealerSettlements = [{ payout_amount: 2_570_000, status: "確定" }];
  const payments = [{ payment_amount: 4_000_000, status: "取消" }];

  const r = computeConfirmedCaseProfit({
    invoices: [{ status: "発行済", invoiceAmount: 1_430_000 }],
    orders: [{ status: "発注済", orderAmount: 800_000 }],
    fee: { feeAmount: 0, feeRate: null },
  });

  assert.equal(r.billedInclusive, 1_430_000);
  assert.equal(r.revenue, 1_300_000);
  assert.notEqual(r.revenue, financeReceipts[0].actual_amount);
  assert.notEqual(r.cost, dealerSettlements[0].payout_amount);
  assert.equal(r.profit, 500_000);
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
  assert.equal(
    sumActiveInvoiceRevenue([{ status: "発行済", invoiceAmount: 1_430_000 }]),
    1_300_000
  );
  assert.equal(
    sumActiveInvoiceBilledInclusive([
      { status: "発行済", invoiceAmount: 1_430_000 },
    ]),
    1_430_000
  );
  assert.equal(sumActiveOrderCost([{ status: "発注済", orderAmount: 900_000 }]), 900_000);
  assert.equal(r.revenue, 1_300_000);
  assert.equal(r.cost, 900_000);
  assert.equal(r.profit, 400_000);
});

test("粗利率の分母は税抜売上", () => {
  const r = computeConfirmedCaseProfit({
    invoices: [{ status: "発行済", invoiceAmount: 1_100_000, subtotalExTax: 1_000_000, taxAmount: 100_000 }],
    orders: [{ status: "発注済", orderAmount: 600_000 }],
    fee: { feeAmount: 0 },
  });
  assert.equal(r.rate, 40);
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
