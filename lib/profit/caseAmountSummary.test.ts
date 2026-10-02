import assert from "node:assert/strict";

import { buildCaseAmountSummary } from "@/lib/profit/caseAmountSummary";
import { computeConfirmedCaseProfit } from "@/lib/profit/caseProfitCalc";

const invoices = [
  {
    status: "請求済",
    invoiceAmount: 2_587_250,
    subtotalExTax: 2_352_045,
    taxAmount: 235_205,
  },
  { status: "取消", invoiceAmount: 999_999 },
];
const orders = [
  { status: "発注済", orderAmount: 5_632_000 },
  { status: "キャンセル", orderAmount: 100_000 },
];
const fee = { feeAmount: 0 };

const confirmed = computeConfirmedCaseProfit({ invoices, orders, fee });
const summary = buildCaseAmountSummary({ invoices, orders, fee });

assert.equal(summary.hasActiveInvoices, true);
assert.equal(summary.plannedInvoiceInclusive, confirmed.billedInclusive);
assert.equal(summary.plannedInvoiceInclusive, 2_587_250);
assert.equal(summary.purchaseCostExTax, confirmed.cost);
assert.equal(summary.purchaseCostExTax, 5_632_000);
assert.equal(summary.profitExTax, confirmed.profit);
assert.equal(summary.profitRate, confirmed.rate);

const noInvoice = buildCaseAmountSummary({
  invoices: [{ status: "取消", invoiceAmount: 1_000_000 }],
  orders: [{ status: "発注済", orderAmount: 100_000 }],
  fee: { feeAmount: 0 },
});
assert.equal(noInvoice.hasActiveInvoices, false);
assert.equal(noInvoice.plannedInvoiceInclusive, null);
assert.equal(noInvoice.purchaseCostExTax, 100_000);
assert.equal(
  noInvoice.profitExTax,
  computeConfirmedCaseProfit({
    invoices: [{ status: "取消", invoiceAmount: 1_000_000 }],
    orders: [{ status: "発注済", orderAmount: 100_000 }],
    fee: { feeAmount: 0 },
  }).profit
);

console.log("caseAmountSummary: ok");
