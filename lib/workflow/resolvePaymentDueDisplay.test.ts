/**
 * 売掛の入金予定日 / 支払期限表示
 * Run: npx tsx lib/workflow/resolvePaymentDueDisplay.test.ts
 */
import assert from "node:assert/strict";

import { summarizeDashboardInvoiceUnpaid } from "@/lib/dashboard/invoiceUnpaid";
import { buildCollectionQueueRow } from "@/lib/queues/collectionQueue";
import { computeCreditDates } from "@/lib/workflow/conditions";
import { findCreditDueDateMismatches } from "@/lib/workflow/findCreditDueDateMismatches";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import {
  isCreditDueDateMismatch,
  resolvePaymentDueDisplay,
} from "@/lib/workflow/resolvePaymentDueDisplay";

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

const julyDeliveryOrders = [
  { id: "o1", status: "納品済", deliveredDate: "2026-07-09" },
];

check("ケースA: 実納品日 2026-07-09 → workflow paymentDueDate = 2026-08-31", () => {
  const planned = computeCreditDates(julyDeliveryOrders);
  assert.equal(planned.billingClosingDate, "2026-07-31");
  assert.equal(planned.paymentDueDate, "2026-08-31");

  const workflow = evaluateWorkflow({
    settlementType: "売掛",
    loanStatus: null,
    cardStatus: null,
    depositAmount: null,
    constructionCompletedDate: null,
    orders: julyDeliveryOrders,
    invoices: [],
    payments: [],
  });
  assert.equal(workflow.paymentDueDate, "2026-08-31");

  const display = resolvePaymentDueDisplay({
    ruleKey: workflow.ruleKey,
    invoices: [],
    plannedPaymentDueDate: workflow.paymentDueDate,
  });
  assert.equal(display.kind, "planned");
  assert.equal(display.date, "2026-08-31");
  assert.equal(display.label, "入金予定日（予定）");
  assert.equal(display.isMismatch, false);
});

check("ケースD: 保存 due_date 2026-09-30 と業務ルール 2026-08-31 は mismatch", () => {
  const display = resolvePaymentDueDisplay({
    ruleKey: "売掛",
    invoices: [{ status: "請求済", due_date: "2026-09-30" }],
    plannedPaymentDueDate: "2026-08-31",
  });
  assert.equal(display.kind, "confirmed");
  assert.equal(display.date, "2026-09-30");
  assert.equal(display.label, "支払期限");
  assert.equal(display.ruleDueDate, "2026-08-31");
  assert.equal(display.savedDueDate, "2026-09-30");
  assert.equal(display.isMismatch, true);
  assert.equal(isCreditDueDateMismatch("2026-08-31", "2026-09-30"), true);
});

check("ケースE: 保存 due_date 2026-08-31 は mismatch なし", () => {
  const display = resolvePaymentDueDisplay({
    ruleKey: "売掛",
    invoices: [{ status: "請求済", due_date: "2026-08-31" }],
    plannedPaymentDueDate: "2026-08-31",
  });
  assert.equal(display.date, "2026-08-31");
  assert.equal(display.isMismatch, false);
  assert.equal(isCreditDueDateMismatch("2026-08-31", "2026-08-31"), false);
});

check("VE-1787020950261 相当は正常一致ではない", () => {
  const mismatches = findCreditDueDateMismatches([
    {
      caseId: "case-ve",
      caseNo: "VE-1787020950261",
      settlementType: "売掛",
      orders: [{ status: "納品済", deliveredDate: "2026-07-09" }],
      invoices: [{ id: "inv1", status: "請求済", due_date: "2026-09-30" }],
    },
  ]);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].caseNo, "VE-1787020950261");
  assert.equal(mismatches[0].ruleDueDate, "2026-08-31");
  assert.equal(mismatches[0].savedDueDate, "2026-09-30");
});

check("一致案件は洗い出し対象外", () => {
  const mismatches = findCreditDueDateMismatches([
    {
      caseId: "ok",
      caseNo: "VE-OK",
      settlementType: "売掛",
      orders: [{ status: "納品済", deliveredDate: "2026-07-09" }],
      invoices: [{ id: "inv1", status: "請求済", due_date: "2026-08-31" }],
    },
  ]);
  assert.equal(mismatches.length, 0);
});

check("ケースF: 3社間は顧客 invoice due があっても dueDate null / isOverdue false", () => {
  const display = resolvePaymentDueDisplay({
    ruleKey: "3社間決済",
    invoices: [{ status: "請求済", due_date: "2026-07-01" }],
    plannedPaymentDueDate: "2026-08-31",
  });
  assert.equal(display.kind, "none");
  assert.equal(display.date, null);
  assert.equal(display.isMismatch, false);

  const row = buildCollectionQueueRow({
    id: "c1",
    case_no: "VE-3",
    status: "完工",
    customer_name: "顧客",
    order_received_date: "2026-07-01",
    dealer_name: "店",
    settlement_type: "3社間決済",
    deposit_amount: null,
    loan_status: "承認済",
    card_status: null,
    approval_number: "A-1",
    construction_completed_date: "2026-07-10",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-07-09" }],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 1_430_000,
        due_date: "2026-07-01",
      },
    ],
    payments: [],
    finance_receipts: [],
    today: "2026-08-18",
  });
  assert.ok(row);
  assert.equal(row!.dueDate, null);
  assert.equal(row!.isOverdue, false);

  const dashboard = summarizeDashboardInvoiceUnpaid({
    invoiceAmount: 1_430_000,
    dueDate: "2026-07-01",
    payments: [],
    settlementType: "3社間決済",
    financeReceipts: [],
    dealerSettlements: [],
    today: "2026-08-18",
  });
  assert.equal(dashboard.isOverdue, false);
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll resolvePaymentDueDisplay checks passed");
