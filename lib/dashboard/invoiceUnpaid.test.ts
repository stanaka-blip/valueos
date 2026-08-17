/**
 * ダッシュボード未入金（通常維持 / 3社間は /payments と同じ）
 * Run: npx tsx lib/dashboard/invoiceUnpaid.test.ts
 */
import assert from "node:assert/strict";

import { summarizeInvoicePayments } from "@/lib/payments/invoicePaymentStatus";
import { computeThreePartyRecoveryAmounts } from "@/lib/threeParty/threePartyRecovery";

import { summarizeDashboardInvoiceUnpaid } from "./invoiceUnpaid";

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

check("通常決済の未入金計算を壊さない", () => {
  const payments = [
    { invoice_id: "i1", payment_amount: 40_000, status: "入金確認済" },
  ];
  const r = summarizeDashboardInvoiceUnpaid({
    invoiceAmount: 100_000,
    dueDate: "2026-08-31",
    payments,
    settlementType: "売掛",
    financeReceipts: [],
    dealerSettlements: [],
    today: "2026-08-01",
  });
  const expected = summarizeInvoicePayments({
    invoiceAmount: 100_000,
    dueDate: "2026-08-31",
    payments: [{ paymentAmount: 40_000, status: "入金確認済" }],
    today: "2026-08-01",
  });
  assert.equal(r.unpaidAmount, expected.unpaidAmount);
  assert.equal(r.unpaidAmount, 60_000);
  assert.equal(r.isUnpaidLike, true);
  assert.equal(r.isOverdue, false);
});

check("通常決済: 期限超過は顧客 due × payments 残", () => {
  const r = summarizeDashboardInvoiceUnpaid({
    invoiceAmount: 100_000,
    dueDate: "2026-07-01",
    payments: [],
    settlementType: "売掛",
    financeReceipts: [],
    dealerSettlements: [],
    today: "2026-08-01",
  });
  assert.equal(r.isOverdue, true);
  assert.equal(r.unpaidAmount, 100_000);
});

check("3社間の未入金が /payments と同じ（信販入金済・仕切支払済なら残0）", () => {
  const invoiceAmount = 1_430_000;
  const r = summarizeDashboardInvoiceUnpaid({
    invoiceAmount,
    dueDate: "2026-07-01",
    payments: [],
    settlementType: "3社間決済",
    financeReceipts: [
      { status: "入金済", actual_amount: 4_000_000, scheduled_amount: 4_000_000 },
    ],
    dealerSettlements: [
      { status: "支払済", actual_payout_amount: 2_570_000, payout_amount: 2_570_000 },
    ],
    today: "2026-08-01",
  });
  const expected = computeThreePartyRecoveryAmounts({
    invoiceTotalAmount: invoiceAmount,
    financePaidAmount: 4_000_000,
    dealerPaidAmount: 2_570_000,
  });
  assert.equal(r.unpaidAmount, expected.unpaidBalance);
  assert.equal(r.unpaidAmount, 0);
  assert.equal(r.isUnpaidLike, false);
  assert.equal(r.isOverdue, false);
});

check("3社間: 顧客 payments がなくても信販入金済なら顧客未入金では残さない", () => {
  const r = summarizeDashboardInvoiceUnpaid({
    invoiceAmount: 1_430_000,
    dueDate: "2026-07-01",
    payments: [],
    settlementType: "ローン",
    financeReceipts: [
      { status: "入金済", actual_amount: 1_430_000, scheduled_amount: 1_430_000 },
    ],
    dealerSettlements: [],
    today: "2026-08-01",
  });
  assert.equal(r.unpaidAmount, 0);
  assert.equal(r.isOverdue, false);
});

check("3社間: 顧客請求 due では期限超過にしない", () => {
  const r = summarizeDashboardInvoiceUnpaid({
    invoiceAmount: 1_430_000,
    dueDate: "2026-07-01",
    payments: [],
    settlementType: "3社間決済",
    financeReceipts: [],
    dealerSettlements: [],
    today: "2026-08-01",
  });
  assert.equal(r.unpaidAmount, 1_430_000);
  assert.equal(r.isUnpaidLike, true);
  assert.equal(r.isOverdue, false);
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll invoiceUnpaid checks passed");
