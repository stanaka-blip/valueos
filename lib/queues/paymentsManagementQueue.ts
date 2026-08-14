/**
 * 支払管理キュー（/queues/payments-management）の純関数。
 * KPIなし。今支払う必要があるものだけ。
 *
 * 将来の一括支払拡張用に payeeKey / periodKey を保持する（今回は表示のみ）。
 */

import { isOrderDelivered } from "@/lib/queues/deliveryQueue";
import { isActiveCaseStatus, isActiveOrderStatus } from "@/lib/status/activeRecords";
import { isDueDateOverdue } from "@/lib/threeParty/moneyEventStatus";

export type ThreePartyPaymentStage =
  | "needs_settlement"
  | "needs_confirm"
  | "needs_pay";

export type ThreePartyPaymentQueueInput = {
  caseId: string;
  caseNo: string | null;
  caseStatus: string | null;
  customerName: string | null;
  dealerId: string | null;
  dealerName: string | null;
  settlementType: string | null;
  /** 有効な信販入金（取消以外）。入金済が1件以上必要 */
  financeReceipts: ReadonlyArray<{
    id: string;
    financeCompany: string;
    status: string;
    actualDate: string | null;
    actualAmount: number | null;
    scheduledAmount: number;
  }>;
  /** 有効な仕切（取消以外）。最新を採用 */
  dealerSettlements: ReadonlyArray<{
    id: string;
    status: string;
    creditReceivedAmount: number;
    veShareAmount: number;
    adjustmentTotalAmount: number;
    payoutAmount: number;
    scheduledPayoutDate: string | null;
    financeReceiptId: string | null;
  }>;
};

export type ThreePartyPaymentQueueRow = {
  id: string;
  caseId: string;
  caseNo: string;
  customerName: string;
  dealerId: string | null;
  dealerName: string;
  financeReceiptId: string;
  financeCompany: string;
  financeActualDate: string | null;
  financeAmount: number;
  settlementId: string | null;
  settlementStatus: string | null;
  stage: ThreePartyPaymentStage;
  stageLabel: string;
  nextActionLabel: string;
  veShareAmount: number | null;
  adjustmentTotalAmount: number | null;
  payoutAmount: number | null;
  scheduledPayoutDate: string | null;
  priorityRank: number;
  /** 将来の一括支払キー */
  payeeKey: string;
  periodKey: string;
  caseHref: string;
  printHref: string | null;
};

export type SupplierPaymentQueueInput = {
  orderId: string;
  orderNo: string | null;
  caseId: string;
  caseNo: string | null;
  caseStatus: string | null;
  customerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  orderStatus: string | null;
  deliveredDate: string | null;
  orderAmount: number;
  /** 当該 order の有効 supplier_payments（取消以外） */
  payments: ReadonlyArray<{
    id: string;
    status: string;
    dueDate: string | null;
    scheduledAmount: number;
  }>;
};

export type SupplierPaymentQueueRow = {
  id: string;
  orderId: string;
  orderNo: string;
  caseId: string;
  caseNo: string;
  customerName: string;
  supplierId: string;
  supplierName: string;
  deliveredDate: string | null;
  amount: number;
  dueDate: string | null;
  supplierPaymentId: string | null;
  stage: "needs_create_and_pay" | "needs_pay";
  stageLabel: string;
  nextActionLabel: string;
  isOverdue: boolean;
  priorityRank: number;
  payeeKey: string;
  periodKey: string;
  caseHref: string;
};

function trim(value: string | null | undefined): string {
  return (value || "").trim();
}

function monthKey(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(trim(date));
  return m ? `${m[1]}-${m[2]}` : "unknown";
}

function pickLatestPaidFinance(
  receipts: ThreePartyPaymentQueueInput["financeReceipts"]
) {
  const paid = receipts.filter((r) => trim(r.status) === "入金済");
  if (paid.length === 0) return null;
  return [...paid].sort((a, b) =>
    trim(b.actualDate).localeCompare(trim(a.actualDate))
  )[0];
}

function pickActiveSettlement(
  settlements: ThreePartyPaymentQueueInput["dealerSettlements"]
) {
  const active = settlements.filter((s) => trim(s.status) !== "取消");
  if (active.length === 0) return null;
  // 支払済があればキュー対象外にするので、支払済以外を優先して返す
  const unpaid = active.filter((s) => trim(s.status) !== "支払済");
  if (unpaid.length === 0) return active[0];
  // 確定 > 下書き
  const confirmed = unpaid.find((s) => trim(s.status) === "確定");
  if (confirmed) return confirmed;
  const draft = unpaid.find((s) => trim(s.status) === "下書き");
  return draft || unpaid[0];
}

export function buildThreePartyPaymentQueueRow(
  input: ThreePartyPaymentQueueInput
): ThreePartyPaymentQueueRow | null {
  if (!isActiveCaseStatus(input.caseStatus)) return null;
  if (trim(input.settlementType) !== "3社間決済") return null;

  const finance = pickLatestPaidFinance(input.financeReceipts);
  if (!finance) return null;

  const settlement = pickActiveSettlement(input.dealerSettlements);
  if (settlement && trim(settlement.status) === "支払済") return null;

  let stage: ThreePartyPaymentStage;
  let stageLabel: string;
  let nextActionLabel: string;
  let priorityRank: number;

  if (!settlement) {
    stage = "needs_settlement";
    stageLabel = "仕切未作成";
    nextActionLabel = "金額確認・仕切作成";
    priorityRank = 3;
  } else if (trim(settlement.status) === "下書き") {
    stage = "needs_confirm";
    stageLabel = "下書き（未確定）";
    nextActionLabel = "仕切を確定";
    priorityRank = 2;
  } else if (trim(settlement.status) === "確定") {
    stage = "needs_pay";
    stageLabel = "支払待ち";
    nextActionLabel = "支払処理";
    priorityRank = 1;
  } else {
    return null;
  }

  const financeAmount =
    finance.actualAmount != null && Number.isFinite(finance.actualAmount)
      ? Math.floor(finance.actualAmount)
      : Math.floor(finance.scheduledAmount);

  const scheduledPayoutDate = settlement?.scheduledPayoutDate || null;
  const payeeKey = input.dealerId || `case:${input.caseId}`;
  const periodKey = scheduledPayoutDate
    ? monthKey(scheduledPayoutDate)
    : monthKey(finance.actualDate);

  return {
    id: `${input.caseId}:${finance.id}:${settlement?.id || "none"}`,
    caseId: input.caseId,
    caseNo: trim(input.caseNo) || "—",
    customerName: trim(input.customerName) || "—",
    dealerId: input.dealerId,
    dealerName: trim(input.dealerName) || "—",
    financeReceiptId: finance.id,
    financeCompany: trim(finance.financeCompany) || "—",
    financeActualDate: finance.actualDate,
    financeAmount,
    settlementId: settlement?.id || null,
    settlementStatus: settlement ? trim(settlement.status) : null,
    stage,
    stageLabel,
    nextActionLabel,
    veShareAmount: settlement ? settlement.veShareAmount : null,
    adjustmentTotalAmount: settlement
      ? settlement.adjustmentTotalAmount
      : null,
    payoutAmount: settlement ? settlement.payoutAmount : null,
    scheduledPayoutDate,
    priorityRank,
    payeeKey,
    periodKey,
    caseHref: `/cases/${input.caseId}?tab=settlement`,
    printHref: settlement
      ? `/dealer-settlements/${settlement.id}/print`
      : null,
  };
}

export function sortThreePartyPaymentQueueRows(
  rows: readonly ThreePartyPaymentQueueRow[]
): ThreePartyPaymentQueueRow[] {
  return [...rows].sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank;
    }
    const ad = trim(a.financeActualDate) || "9999-99-99";
    const bd = trim(b.financeActualDate) || "9999-99-99";
    if (ad !== bd) return ad.localeCompare(bd);
    const ap = trim(a.scheduledPayoutDate) || "9999-99-99";
    const bp = trim(b.scheduledPayoutDate) || "9999-99-99";
    if (ap !== bp) return ap.localeCompare(bp);
    return a.caseNo.localeCompare(b.caseNo, "ja");
  });
}

export function buildSupplierPaymentQueueRow(
  input: SupplierPaymentQueueInput,
  today?: string
): SupplierPaymentQueueRow | null {
  if (!isActiveCaseStatus(input.caseStatus)) return null;
  if (!isActiveOrderStatus(input.orderStatus)) return null;
  if (!isOrderDelivered(input)) return null;

  const supplierId = trim(input.supplierId);
  if (!supplierId) return null;

  const activePayments = input.payments.filter(
    (p) => trim(p.status) !== "取消"
  );
  if (activePayments.some((p) => trim(p.status) === "支払済")) {
    return null;
  }

  const pending = activePayments.find((p) => trim(p.status) === "予定");
  const amount = pending
    ? Math.floor(pending.scheduledAmount)
    : Math.floor(input.orderAmount);
  const dueDate = pending?.dueDate || null;
  const overdue = isDueDateOverdue({ dueDate, today });

  let priorityRank = 3;
  if (overdue) priorityRank = 1;
  else if (dueDate) priorityRank = 2;

  const stage = pending ? "needs_pay" : "needs_create_and_pay";

  return {
    id: pending
      ? `sp:${pending.id}`
      : `order:${input.orderId}`,
    orderId: input.orderId,
    orderNo: trim(input.orderNo) || "—",
    caseId: input.caseId,
    caseNo: trim(input.caseNo) || "—",
    customerName: trim(input.customerName) || "—",
    supplierId,
    supplierName: trim(input.supplierName) || "—",
    deliveredDate: input.deliveredDate,
    amount,
    dueDate,
    supplierPaymentId: pending?.id || null,
    stage,
    stageLabel: pending ? "支払待ち" : "支払待ち（未登録）",
    nextActionLabel: "支払処理",
    isOverdue: overdue,
    priorityRank,
    payeeKey: supplierId,
    periodKey: dueDate ? monthKey(dueDate) : monthKey(input.deliveredDate),
    caseHref: `/cases/${input.caseId}?tab=payment`,
  };
}

export function sortSupplierPaymentQueueRows(
  rows: readonly SupplierPaymentQueueRow[]
): SupplierPaymentQueueRow[] {
  return [...rows].sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank;
    }
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    const ad = trim(a.deliveredDate) || "9999-99-99";
    const bd = trim(b.deliveredDate) || "9999-99-99";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.orderNo.localeCompare(b.orderNo, "ja");
  });
}
