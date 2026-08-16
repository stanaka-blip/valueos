import assert from "node:assert/strict";
import test from "node:test";

import { buildCollectionQueueRow } from "./collectionQueue";
import {
  buildSupplierPaymentQueueRow,
  buildThreePartyPaymentQueueRow,
  hasDeliveredOnOrBeforeToday,
  sortSupplierPaymentQueueRows,
  sortThreePartyPaymentQueueRows,
} from "./paymentsManagementQueue";

const baseThree = {
  caseId: "c1",
  caseNo: "C-001",
  caseStatus: "対応中",
  customerName: "山田",
  dealerId: "d1",
  dealerName: "販売店A",
  settlementType: "3社間決済",
  loanStatus: "承認済",
  approvalNumber: "AP-001",
  financeReceipts: [
    {
      id: "f1",
      financeCompany: "アプラス",
      status: "入金済",
      actualDate: "2026-08-01",
      actualAmount: 2340000,
      scheduledAmount: 2340000,
    },
  ],
  dealerSettlements: [] as Array<{
    id: string;
    status: string;
    creditReceivedAmount: number;
    veShareAmount: number;
    adjustmentTotalAmount: number;
    payoutAmount: number;
    scheduledPayoutDate: string | null;
    financeReceiptId: string | null;
  }>,
  invoices: [
    { id: "inv1", status: "請求済", invoiceAmount: 900000 },
  ],
  orders: [
    { id: "o1", status: "納品済", deliveredDate: "2026-07-20" },
  ],
  today: "2026-08-16",
};

test("3社間: 入金済かつ有効請求あり・仕切未作成は仕切精算書作成", () => {
  const row = buildThreePartyPaymentQueueRow(baseThree);
  assert.ok(row);
  assert.equal(row!.stage, "needs_settlement");
  assert.equal(row!.nextActionLabel, "仕切精算書作成");
  assert.equal(row!.invoiceTotalAmount, 900000);
  assert.equal(row!.suggestedPayoutAmount, 1440000);
  assert.equal(row!.payeeKey, "d1");
});

test("3社間: 入金済でも有効請求が無ければ仕切未作成に出ない", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    invoices: [],
  });
  assert.equal(row, null);
});

test("3社間: 下書きは確定待ち（支払待ちに含めない）", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    dealerSettlements: [
      {
        id: "s1",
        status: "下書き",
        creditReceivedAmount: 2340000,
        veShareAmount: 900000,
        adjustmentTotalAmount: 0,
        payoutAmount: 1440000,
        scheduledPayoutDate: "2026-08-20",
        financeReceiptId: "f1",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_confirm");
  assert.equal(row!.stageLabel, "仕切下書き");
  assert.equal(row!.settlementId, "s1");
});

test("3社間: 確定は支払待ち", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    dealerSettlements: [
      {
        id: "s1",
        status: "確定",
        creditReceivedAmount: 2340000,
        veShareAmount: 900000,
        adjustmentTotalAmount: 0,
        payoutAmount: 1440000,
        scheduledPayoutDate: "2026-08-20",
        financeReceiptId: "f1",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_pay");
  assert.equal(row!.stageLabel, "支払待ち");
});

test("3社間: 支払済は出ない", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    dealerSettlements: [
      {
        id: "s1",
        status: "支払済",
        creditReceivedAmount: 2340000,
        veShareAmount: 900000,
        adjustmentTotalAmount: 0,
        payoutAmount: 1440000,
        scheduledPayoutDate: "2026-08-20",
        financeReceiptId: "f1",
      },
    ],
  });
  assert.equal(row, null);
});

test("3社間: 信販未入金でも承認済・納品済なら入金確認待ち", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    financeReceipts: [],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_finance_confirm");
  assert.equal(row!.nextActionLabel, "信販入金を確認してください");
});

test("3社間: 信販予定のみは入金確認待ち（入金済が必要）", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    financeReceipts: [
      {
        id: "f1",
        financeCompany: "アプラス",
        status: "予定",
        actualDate: null,
        actualAmount: null,
        scheduledAmount: 2340000,
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_finance_confirm");
});

test("3社間: ローン未承認は入金確認待ちに出ない", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    financeReceipts: [],
    loanStatus: "申請中",
    approvalNumber: null,
  });
  assert.equal(row, null);
});

test("3社間: 未納品は入金確認待ちに出ない", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    financeReceipts: [],
    orders: [{ id: "o1", status: "発注済", deliveredDate: null }],
  });
  assert.equal(row, null);
});

test("納品日判定: 未来の納品日は false", () => {
  assert.equal(
    hasDeliveredOnOrBeforeToday(
      [{ id: "o1", status: "納品済", deliveredDate: "2026-08-20" }],
      "2026-08-16"
    ),
    false
  );
});

test("3社間: 優先は支払待ち > 下書き > 仕切未作成 > 入金確認", () => {
  const pay = buildThreePartyPaymentQueueRow({
    ...baseThree,
    caseNo: "C-pay",
    dealerSettlements: [
      {
        id: "s1",
        status: "確定",
        creditReceivedAmount: 1,
        veShareAmount: 1,
        adjustmentTotalAmount: 0,
        payoutAmount: 0,
        scheduledPayoutDate: null,
        financeReceiptId: "f1",
      },
    ],
  })!;
  const draft = buildThreePartyPaymentQueueRow({
    ...baseThree,
    caseNo: "C-draft",
    dealerSettlements: [
      {
        id: "s1",
        status: "下書き",
        creditReceivedAmount: 1,
        veShareAmount: 1,
        adjustmentTotalAmount: 0,
        payoutAmount: 0,
        scheduledPayoutDate: null,
        financeReceiptId: "f1",
      },
    ],
  })!;
  const create = buildThreePartyPaymentQueueRow({
    ...baseThree,
    caseNo: "C-create",
  })!;
  const finance = buildThreePartyPaymentQueueRow({
    ...baseThree,
    caseNo: "C-fin",
    financeReceipts: [],
  })!;
  const sorted = sortThreePartyPaymentQueueRows([finance, create, draft, pay]);
  assert.deepEqual(
    sorted.map((r) => r.stage),
    ["needs_pay", "needs_confirm", "needs_settlement", "needs_finance_confirm"]
  );
});

test("仕入先: 納品済で payments 未作成でも出る", () => {
  const row = buildSupplierPaymentQueueRow({
    orderId: "o1",
    orderNo: "PO-1",
    caseId: "c1",
    caseNo: "C-1",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-08-01",
    orderAmount: 500000,
    payments: [],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_create_and_pay");
  assert.equal(row!.amount, 500000);
});

test("仕入先: 決済区分に依存せず前金案件でもキューに出る", () => {
  const row = buildSupplierPaymentQueueRow({
    orderId: "o-advance",
    orderNo: "PO-ADV",
    caseId: "c-adv",
    caseNo: "C-ADV",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-08-02",
    orderAmount: 200000,
    payments: [],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_create_and_pay");
  assert.equal(row!.caseHref, "/cases/c-adv?tab=payment");
});

test("仕入先: 未納品は出ない", () => {
  const row = buildSupplierPaymentQueueRow({
    orderId: "o1",
    orderNo: "PO-1",
    caseId: "c1",
    caseNo: "C-1",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "発注済",
    deliveredDate: null,
    orderAmount: 500000,
    payments: [],
  });
  assert.equal(row, null);
});

test("仕入先: 支払済は出ない", () => {
  const row = buildSupplierPaymentQueueRow({
    orderId: "o1",
    orderNo: "PO-1",
    caseId: "c1",
    caseNo: "C-1",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-08-01",
    orderAmount: 500000,
    payments: [
      {
        id: "sp1",
        status: "支払済",
        dueDate: "2026-08-10",
        scheduledAmount: 500000,
      },
    ],
  });
  assert.equal(row, null);
});

test("仕入先: 期限超過が先、同条件は納品日古い順", () => {
  const a = buildSupplierPaymentQueueRow(
    {
      orderId: "o1",
      orderNo: "PO-1",
      caseId: "c1",
      caseNo: "C-1",
      caseStatus: "対応中",
      customerName: "顧客",
      supplierId: "sup1",
      supplierName: "商社",
      orderStatus: "納品済",
      deliveredDate: "2026-08-10",
      orderAmount: 1,
      payments: [
        {
          id: "sp1",
          status: "予定",
          dueDate: "2026-08-01",
          scheduledAmount: 1,
        },
      ],
    },
    "2026-08-16"
  )!;
  const b = buildSupplierPaymentQueueRow(
    {
      orderId: "o2",
      orderNo: "PO-2",
      caseId: "c1",
      caseNo: "C-1",
      caseStatus: "対応中",
      customerName: "顧客",
      supplierId: "sup1",
      supplierName: "商社",
      orderStatus: "納品済",
      deliveredDate: "2026-08-01",
      orderAmount: 1,
      payments: [],
    },
    "2026-08-16"
  )!;
  const sorted = sortSupplierPaymentQueueRows([b, a]);
  assert.equal(sorted[0].orderId, "o1");
});

test("E2Eシナリオ: 3社間 入金確認→仕切→確定→支払済で消える", () => {
  const pending = buildThreePartyPaymentQueueRow({
    ...baseThree,
    financeReceipts: [],
  });
  assert.equal(pending!.stage, "needs_finance_confirm");

  const create = buildThreePartyPaymentQueueRow(baseThree);
  assert.equal(create!.stage, "needs_settlement");
  assert.equal(create!.suggestedPayoutAmount, 1440000);

  const draft = buildThreePartyPaymentQueueRow({
    ...baseThree,
    dealerSettlements: [
      {
        id: "s1",
        status: "下書き",
        creditReceivedAmount: 2340000,
        veShareAmount: 900000,
        adjustmentTotalAmount: 0,
        payoutAmount: 1440000,
        scheduledPayoutDate: null,
        financeReceiptId: "f1",
      },
    ],
  });
  assert.equal(draft!.stage, "needs_confirm");

  const confirmed = buildThreePartyPaymentQueueRow({
    ...baseThree,
    dealerSettlements: [
      {
        id: "s1",
        status: "確定",
        creditReceivedAmount: 2340000,
        veShareAmount: 900000,
        adjustmentTotalAmount: 0,
        payoutAmount: 1440000,
        scheduledPayoutDate: null,
        financeReceiptId: "f1",
      },
    ],
  });
  assert.equal(confirmed!.stage, "needs_pay");

  const paid = buildThreePartyPaymentQueueRow({
    ...baseThree,
    dealerSettlements: [
      {
        id: "s1",
        status: "支払済",
        creditReceivedAmount: 2340000,
        veShareAmount: 900000,
        adjustmentTotalAmount: 0,
        payoutAmount: 1440000,
        scheduledPayoutDate: null,
        financeReceiptId: "f1",
      },
    ],
  });
  assert.equal(paid, null);
});

test("E2Eシナリオ: 仕入先 未納品非表示→納品済未登録表示→支払済で消える", () => {
  const before = buildSupplierPaymentQueueRow({
    orderId: "o1",
    orderNo: "PO-1",
    caseId: "c1",
    caseNo: "C-1",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "発注済",
    deliveredDate: null,
    orderAmount: 100,
    payments: [],
  });
  assert.equal(before, null);

  const virtual = buildSupplierPaymentQueueRow({
    orderId: "o1",
    orderNo: "PO-1",
    caseId: "c1",
    caseNo: "C-1",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-08-01",
    orderAmount: 100,
    payments: [],
  });
  assert.equal(virtual!.supplierPaymentId, null);

  const scheduled = buildSupplierPaymentQueueRow({
    orderId: "o1",
    orderNo: "PO-1",
    caseId: "c1",
    caseNo: "C-1",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-08-01",
    orderAmount: 100,
    payments: [
      {
        id: "sp1",
        status: "予定",
        dueDate: "2026-08-15",
        scheduledAmount: 100,
      },
    ],
  });
  assert.equal(scheduled!.supplierPaymentId, "sp1");

  const paid = buildSupplierPaymentQueueRow({
    orderId: "o1",
    orderNo: "PO-1",
    caseId: "c1",
    caseNo: "C-1",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-08-01",
    orderAmount: 100,
    payments: [
      {
        id: "sp1",
        status: "支払済",
        dueDate: "2026-08-15",
        scheduledAmount: 100,
      },
    ],
  });
  assert.equal(paid, null);
});

test("将来一括用キー: payeeKey / periodKey を保持", () => {
  const three = buildThreePartyPaymentQueueRow(baseThree)!;
  assert.equal(three.payeeKey, "d1");
  assert.equal(three.periodKey, "2026-08");
  const supplier = buildSupplierPaymentQueueRow({
    orderId: "o9",
    orderNo: "PO-9",
    caseId: "c9",
    caseNo: "C-9",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup9",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-08-05",
    orderAmount: 10,
    payments: [],
  })!;
  assert.equal(supplier.payeeKey, "sup9");
  assert.equal(supplier.periodKey, "2026-08");
});

/**
 * Production BLOCKER 案件 VE-1786852027168 相当:
 * 3社間・承認済・納品済・信販入金済なし・請求なし/ありの両パターン。
 */
test("VE-1786852027168: 支払管理は少なくとも入金確認待ち", () => {
  const caseId = "6b7513ee-b3b3-4933-9b66-0a2a972a01f5";
  const pay = buildThreePartyPaymentQueueRow({
    caseId,
    caseNo: "VE-1786852027168",
    caseStatus: "納品済",
    customerName: "顧客",
    dealerId: "d1",
    dealerName: "販売店",
    settlementType: "3社間決済",
    loanStatus: "承認済",
    approvalNumber: "AP-PROD",
    financeReceipts: [],
    dealerSettlements: [],
    invoices: [],
    orders: [{ id: "o1", status: "納品済", deliveredDate: "2026-08-10" }],
    today: "2026-08-16",
  });
  assert.ok(pay);
  assert.equal(pay!.stage, "needs_finance_confirm");
  assert.equal(pay!.nextActionLabel, "信販入金を確認してください");
});

test("VE-1786852027168: 回収管理は完工/請求/信販の次アクションを返す", () => {
  const caseId = "6b7513ee-b3b3-4933-9b66-0a2a972a01f5";
  const base = {
    id: caseId,
    case_no: "VE-1786852027168",
    status: "納品済",
    customer_name: "顧客",
    order_received_date: "2026-08-01",
    dealer_name: "販売店",
    settlement_type: "3社間決済",
    deposit_amount: null,
    loan_status: "承認済",
    card_status: null,
    approval_number: "AP-PROD",
    orders: [
      { id: "o1", status: "納品済", delivered_date: "2026-08-10" },
    ],
    payments: [],
    finance_receipts: [] as Array<{ id: string; status: string }>,
  };

  const noCompletion = buildCollectionQueueRow({
    ...base,
    construction_completed_date: null,
    invoices: [],
  });
  assert.equal(noCompletion?.stateLabel, "完工待ち");
  assert.equal(noCompletion?.nextAction, "完工日を登録");

  const needInvoice = buildCollectionQueueRow({
    ...base,
    construction_completed_date: "2026-08-11",
    invoices: [],
  });
  assert.equal(needInvoice?.stateLabel, "請求待ち");
  assert.equal(needInvoice?.nextAction, "請求書を作成");

  const needFinance = buildCollectionQueueRow({
    ...base,
    construction_completed_date: "2026-08-11",
    invoices: [
      {
        id: "inv1",
        status: "請求済",
        invoice_amount: 1000000,
        due_date: null,
      },
    ],
    finance_receipts: [],
  });
  assert.equal(needFinance?.stateLabel, "信販入金待ち");
  assert.equal(needFinance?.nextAction, "信販入金を確認");
  assert.equal(needFinance?.displayStateLabel, "信販入金待ち");

  const done = buildCollectionQueueRow({
    ...base,
    construction_completed_date: "2026-08-11",
    invoices: [
      {
        id: "inv1",
        status: "請求済",
        invoice_amount: 1000000,
        due_date: null,
      },
    ],
    finance_receipts: [{ id: "f1", status: "入金済" }],
  });
  assert.equal(done, null);
});
