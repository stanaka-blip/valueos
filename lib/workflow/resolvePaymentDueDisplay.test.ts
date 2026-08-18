/**
 * 売掛の入金予定日 / 支払期限表示
 * Run: npx tsx lib/workflow/resolvePaymentDueDisplay.test.ts
 */
import assert from "node:assert/strict";

import { summarizeDashboardInvoiceUnpaid } from "@/lib/dashboard/invoiceUnpaid";
import { buildCollectionQueueRow } from "@/lib/queues/collectionQueue";
import { computeCreditDates } from "@/lib/workflow/conditions";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import {
  pickEarliestActiveInvoiceDueDate,
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

check("ケースA: 売掛・請求前 納品日 2026-07-09 → 入金予定日（予定） 2026-08-31", () => {
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
});

check("ケースB: 売掛・請求後 予定 2026-08-31 / due_date 2026-09-30 → 表示 2026-09-30", () => {
  const display = resolvePaymentDueDisplay({
    ruleKey: "売掛",
    invoices: [{ status: "請求済", due_date: "2026-09-30" }],
    plannedPaymentDueDate: "2026-08-31",
  });
  assert.equal(display.kind, "confirmed");
  assert.equal(display.date, "2026-09-30");
  assert.equal(display.label, "支払期限");
});

check("ケースC: 有効請求がある場合は予定日より invoice.due_date を優先", () => {
  const display = resolvePaymentDueDisplay({
    ruleKey: "売掛",
    invoices: [
      { status: "請求済", due_date: "2026-09-30" },
      { status: "取消", due_date: "2026-07-01" },
    ],
    plannedPaymentDueDate: "2026-08-31",
  });
  assert.equal(display.date, "2026-09-30");
  assert.equal(
    pickEarliestActiveInvoiceDueDate([
      { status: "請求済", due_date: "2026-09-30" },
      { status: "取消", due_date: "2026-07-01" },
    ]),
    "2026-09-30"
  );
});

check("ケースD: 有効請求なし → 従来の予定計算へフォールバック", () => {
  const display = resolvePaymentDueDisplay({
    ruleKey: "売掛",
    invoices: [{ status: "取消", due_date: "2026-09-30" }],
    plannedPaymentDueDate: "2026-08-31",
  });
  assert.equal(display.kind, "planned");
  assert.equal(display.date, "2026-08-31");
  assert.equal(display.label, "入金予定日（予定）");
});

check("複数の有効請求は回収管理と同じく due_date 昇順の先頭", () => {
  const invoices = [
    { status: "請求済", due_date: "2026-10-31" },
    { status: "請求済", due_date: "2026-09-15" },
  ];
  const display = resolvePaymentDueDisplay({
    ruleKey: "売掛",
    invoices,
    plannedPaymentDueDate: "2026-08-31",
  });
  const collection = buildCollectionQueueRow({
    id: "c1",
    case_no: "VE-1",
    status: "納品済",
    customer_name: "顧客",
    order_received_date: "2026-07-01",
    dealer_name: "店",
    settlement_type: "売掛",
    deposit_amount: null,
    loan_status: null,
    card_status: null,
    approval_number: null,
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-07-09" }],
    invoices: invoices.map((inv, i) => ({
      id: `i${i}`,
      status: inv.status,
      invoice_amount: 1000,
      due_date: inv.due_date,
    })),
    payments: [],
    today: "2026-08-01",
  });
  assert.equal(display.date, "2026-09-15");
  assert.equal(collection?.dueDate, "2026-09-15");
});

check("ケースE: 3社間は顧客 invoice due があっても dueDate null / isOverdue false", () => {
  const display = resolvePaymentDueDisplay({
    ruleKey: "3社間決済",
    invoices: [{ status: "請求済", due_date: "2026-07-01" }],
    plannedPaymentDueDate: "2026-08-31",
  });
  assert.equal(display.kind, "none");
  assert.equal(display.date, null);

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
