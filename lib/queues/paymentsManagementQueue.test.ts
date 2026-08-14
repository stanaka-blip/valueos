import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupplierPaymentQueueRow,
  buildThreePartyPaymentQueueRow,
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
};

test("3社間: 入金済かつ仕切未作成でもキューに出る", () => {
  const row = buildThreePartyPaymentQueueRow(baseThree);
  assert.ok(row);
  assert.equal(row!.stage, "needs_settlement");
  assert.equal(row!.nextActionLabel, "金額確認・仕切作成");
  assert.equal(row!.payeeKey, "d1");
});

test("3社間: 下書きは確定待ち", () => {
  const row = buildThreePartyPaymentQueueRow({
    ...baseThree,
    dealerSettlements: [
      {
        id: "s1",
        status: "下書き",
        creditReceivedAmount: 2340000,
        veShareAmount: 900000,
        adjustmentTotalAmount: 550,
        payoutAmount: 1439450,
        scheduledPayoutDate: "2026-08-20",
        financeReceiptId: "f1",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_confirm");
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
        adjustmentTotalAmount: 550,
        payoutAmount: 1439450,
        scheduledPayoutDate: "2026-08-20",
        financeReceiptId: "f1",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stage, "needs_pay");
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
        adjustmentTotalAmount: 550,
        payoutAmount: 1439450,
        scheduledPayoutDate: "2026-08-20",
        financeReceiptId: "f1",
      },
    ],
  });
  assert.equal(row, null);
});

test("3社間: 信販未入金は出ない", () => {
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
  assert.equal(row, null);
});

test("3社間: 優先は支払待ち > 確定待ち > 仕切未作成、同段は入金日古い順", () => {
  const a = buildThreePartyPaymentQueueRow({
    ...baseThree,
    caseId: "c-a",
    caseNo: "A",
    financeReceipts: [
      {
        id: "f-a",
        financeCompany: "X",
        status: "入金済",
        actualDate: "2026-08-10",
        actualAmount: 100,
        scheduledAmount: 100,
      },
    ],
    dealerSettlements: [
      {
        id: "s-a",
        status: "確定",
        creditReceivedAmount: 100,
        veShareAmount: 10,
        adjustmentTotalAmount: 0,
        payoutAmount: 90,
        scheduledPayoutDate: null,
        financeReceiptId: "f-a",
      },
    ],
  })!;
  const b = buildThreePartyPaymentQueueRow({
    ...baseThree,
    caseId: "c-b",
    caseNo: "B",
    financeReceipts: [
      {
        id: "f-b",
        financeCompany: "X",
        status: "入金済",
        actualDate: "2026-07-01",
        actualAmount: 100,
        scheduledAmount: 100,
      },
    ],
  })!;
  const c = buildThreePartyPaymentQueueRow({
    ...baseThree,
    caseId: "c-c",
    caseNo: "C",
    financeReceipts: [
      {
        id: "f-c",
        financeCompany: "X",
        status: "入金済",
        actualDate: "2026-08-01",
        actualAmount: 100,
        scheduledAmount: 100,
      },
    ],
    dealerSettlements: [
      {
        id: "s-c",
        status: "下書き",
        creditReceivedAmount: 100,
        veShareAmount: 10,
        adjustmentTotalAmount: 0,
        payoutAmount: 90,
        scheduledPayoutDate: null,
        financeReceiptId: "f-c",
      },
    ],
  })!;
  const sorted = sortThreePartyPaymentQueueRows([b, c, a]);
  assert.deepEqual(
    sorted.map((r) => r.caseId),
    ["c-a", "c-c", "c-b"]
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
        dueDate: "2026-08-31",
        scheduledAmount: 500000,
      },
    ],
  });
  assert.equal(row, null);
});

test("仕入先: 期限超過が先、同条件は納品日古い順", () => {
  const overdue = buildSupplierPaymentQueueRow(
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
    "2026-08-14"
  )!;
  const olderDelivered = buildSupplierPaymentQueueRow({
    orderId: "o2",
    orderNo: "PO-2",
    caseId: "c2",
    caseNo: "C-2",
    caseStatus: "対応中",
    customerName: "顧客",
    supplierId: "sup1",
    supplierName: "商社",
    orderStatus: "納品済",
    deliveredDate: "2026-07-01",
    orderAmount: 1,
    payments: [],
  })!;
  const sorted = sortSupplierPaymentQueueRows([olderDelivered, overdue]);
  assert.equal(sorted[0].orderId, "o1");
  assert.equal(sorted[1].orderId, "o2");
});
