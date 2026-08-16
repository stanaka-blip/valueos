/**
 * 支払管理キュー（/queues/payments-management）の純関数。
 * KPIなし。今支払う必要があるものだけ。
 *
 * 将来の一括支払拡張用に payeeKey / periodKey を保持する（今回は表示のみ）。
 */

import { isOrderDelivered } from "@/lib/queues/deliveryQueue";
import { isActiveCaseStatus, isActiveOrderStatus, isActiveInvoiceStatus } from "@/lib/status/activeRecords";
import { isDueDateOverdue } from "@/lib/threeParty/moneyEventStatus";
import { LOAN_APPROVED_STATUSES } from "@/lib/workflow/statusCatalog";

export type ThreePartyPaymentStage =
  | "needs_finance_confirm"
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
  loanStatus: string | null;
  approvalNumber: string | null;
  /** 有効な信販入金（取消以外） */
  financeReceipts: ReadonlyArray<{
    id: string;
    financeCompany: string;
    status: string;
    actualDate: string | null;
    actualAmount: number | null;
    scheduledAmount: number;
  }>;
  /** 有効な仕切（取消以外） */
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
  /** 有効請求（取消除外）。合計は invoiceAmount に使う */
  invoices: ReadonlyArray<{
    id: string;
    status: string | null;
    invoiceAmount: number;
  }>;
  /** 納品判定用 */
  orders: ReadonlyArray<{
    id: string;
    status: string | null;
    deliveredDate: string | null;
  }>;
  today?: string;
};

export type ThreePartyPaymentQueueRow = {
  id: string;
  caseId: string;
  caseNo: string;
  customerName: string;
  dealerId: string | null;
  dealerName: string;
  financeReceiptId: string | null;
  financeCompany: string;
  financeActualDate: string | null;
  financeAmount: number | null;
  /** 有効請求額合計（仕切初期 ve_share / 仕切額計算用） */
  invoiceTotalAmount: number | null;
  /** 初期仕切額 = 信販入金額 - 有効請求額合計（調整なし） */
  suggestedPayoutAmount: number | null;
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

function todayString(today?: string): string {
  if (today) return today;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isLoanApprovedWithNumber(input: {
  loanStatus: string | null | undefined;
  approvalNumber: string | null | undefined;
}): boolean {
  const loan = trim(input.loanStatus);
  const approved = (LOAN_APPROVED_STATUSES as readonly string[]).includes(loan);
  return approved && Boolean(trim(input.approvalNumber));
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
  const unpaid = active.filter((s) => trim(s.status) !== "支払済");
  if (unpaid.length === 0) return active[0];
  const confirmed = unpaid.find((s) => trim(s.status) === "確定");
  if (confirmed) return confirmed;
  const draft = unpaid.find((s) => trim(s.status) === "下書き");
  return draft || unpaid[0];
}

function activeInvoiceTotal(
  invoices: ThreePartyPaymentQueueInput["invoices"]
): number {
  return invoices
    .filter((inv) => isActiveInvoiceStatus(inv.status))
    .reduce((sum, inv) => sum + Math.max(0, Math.floor(inv.invoiceAmount || 0)), 0);
}

function activeInvoiceCount(
  invoices: ThreePartyPaymentQueueInput["invoices"]
): number {
  return invoices.filter((inv) => isActiveInvoiceStatus(inv.status)).length;
}

/**
 * 納品日 <= today。delivered_date がある発注は日付比較。
 * 日付無しで status=納品済 の発注も「納品済み」として許可。
 */
export function hasDeliveredOnOrBeforeToday(
  orders: ThreePartyPaymentQueueInput["orders"],
  today?: string
): boolean {
  const todayStr = todayString(today);
  for (const order of orders) {
    if (!isActiveOrderStatus(order.status)) continue;
    const deliveredDate = trim(order.deliveredDate);
    if (deliveredDate) {
      if (deliveredDate <= todayStr) return true;
      continue;
    }
    if (isOrderDelivered({ status: order.status, delivered_date: order.deliveredDate })) {
      return true;
    }
  }
  return false;
}

export function buildThreePartyPaymentQueueRow(
  input: ThreePartyPaymentQueueInput
): ThreePartyPaymentQueueRow | null {
  if (!isActiveCaseStatus(input.caseStatus)) return null;
  if (trim(input.settlementType) !== "3社間決済") return null;

  const finance = pickLatestPaidFinance(input.financeReceipts);
  const invoiceTotal = activeInvoiceTotal(input.invoices);
  const hasInvoices = activeInvoiceCount(input.invoices) > 0;
  const settlement = pickActiveSettlement(input.dealerSettlements);
  if (settlement && trim(settlement.status) === "支払済") return null;

  const payeeKey = input.dealerId || `case:${input.caseId}`;

  // A. 入金確認待ち（回収との重複許可・安全網）
  if (!finance) {
    if (
      !isLoanApprovedWithNumber({
        loanStatus: input.loanStatus,
        approvalNumber: input.approvalNumber,
      })
    ) {
      return null;
    }
    if (!hasDeliveredOnOrBeforeToday(input.orders, input.today)) {
      return null;
    }
    return {
      id: `${input.caseId}:finance-pending`,
      caseId: input.caseId,
      caseNo: trim(input.caseNo) || "—",
      customerName: trim(input.customerName) || "—",
      dealerId: input.dealerId,
      dealerName: trim(input.dealerName) || "—",
      financeReceiptId: null,
      financeCompany: "—",
      financeActualDate: null,
      financeAmount: null,
      invoiceTotalAmount: hasInvoices ? invoiceTotal : null,
      suggestedPayoutAmount: null,
      settlementId: null,
      settlementStatus: null,
      stage: "needs_finance_confirm",
      stageLabel: "入金確認待ち",
      nextActionLabel: "信販入金を登録してください",
      veShareAmount: null,
      adjustmentTotalAmount: null,
      payoutAmount: null,
      scheduledPayoutDate: null,
      priorityRank: 4,
      payeeKey,
      periodKey: monthKey(todayString(input.today)),
      caseHref: `/cases/${input.caseId}?tab=invoice`,
      printHref: null,
    };
  }

  const financeAmount =
    finance.actualAmount != null && Number.isFinite(finance.actualAmount)
      ? Math.floor(finance.actualAmount)
      : Math.floor(finance.scheduledAmount);

  // B. 仕切未作成: 入金済 ∧ 有効請求あり ∧ 仕切なし
  if (!settlement) {
    if (!hasInvoices) return null;
    const suggestedPayout = Math.max(0, financeAmount - invoiceTotal);
    return {
      id: `${input.caseId}:${finance.id}:none`,
      caseId: input.caseId,
      caseNo: trim(input.caseNo) || "—",
      customerName: trim(input.customerName) || "—",
      dealerId: input.dealerId,
      dealerName: trim(input.dealerName) || "—",
      financeReceiptId: finance.id,
      financeCompany: trim(finance.financeCompany) || "—",
      financeActualDate: finance.actualDate,
      financeAmount,
      invoiceTotalAmount: invoiceTotal,
      suggestedPayoutAmount: suggestedPayout,
      settlementId: null,
      settlementStatus: null,
      stage: "needs_settlement",
      stageLabel: "仕切未作成",
      nextActionLabel: "仕切精算書作成",
      veShareAmount: invoiceTotal,
      adjustmentTotalAmount: 0,
      payoutAmount: suggestedPayout,
      scheduledPayoutDate: null,
      priorityRank: 3,
      payeeKey,
      periodKey: monthKey(finance.actualDate),
      caseHref: `/cases/${input.caseId}?tab=settlement`,
      printHref: null,
    };
  }

  // C. 下書き → 編集・確認（支払待ちに含めない）
  if (trim(settlement.status) === "下書き") {
    return {
      id: `${input.caseId}:${finance.id}:${settlement.id}`,
      caseId: input.caseId,
      caseNo: trim(input.caseNo) || "—",
      customerName: trim(input.customerName) || "—",
      dealerId: input.dealerId,
      dealerName: trim(input.dealerName) || "—",
      financeReceiptId: finance.id,
      financeCompany: trim(finance.financeCompany) || "—",
      financeActualDate: finance.actualDate,
      financeAmount,
      invoiceTotalAmount: hasInvoices ? invoiceTotal : null,
      suggestedPayoutAmount: null,
      settlementId: settlement.id,
      settlementStatus: trim(settlement.status),
      stage: "needs_confirm",
      stageLabel: "仕切下書き",
      nextActionLabel: "仕切を確定",
      veShareAmount: settlement.veShareAmount,
      adjustmentTotalAmount: settlement.adjustmentTotalAmount,
      payoutAmount: settlement.payoutAmount,
      scheduledPayoutDate: settlement.scheduledPayoutDate,
      priorityRank: 2,
      payeeKey,
      periodKey: settlement.scheduledPayoutDate
        ? monthKey(settlement.scheduledPayoutDate)
        : monthKey(finance.actualDate),
      caseHref: `/cases/${input.caseId}?tab=settlement`,
      printHref: `/dealer-settlements/${settlement.id}/print`,
    };
  }

  // D. 確定 → 支払待ち
  if (trim(settlement.status) === "確定") {
    return {
      id: `${input.caseId}:${finance.id}:${settlement.id}`,
      caseId: input.caseId,
      caseNo: trim(input.caseNo) || "—",
      customerName: trim(input.customerName) || "—",
      dealerId: input.dealerId,
      dealerName: trim(input.dealerName) || "—",
      financeReceiptId: finance.id,
      financeCompany: trim(finance.financeCompany) || "—",
      financeActualDate: finance.actualDate,
      financeAmount,
      invoiceTotalAmount: hasInvoices ? invoiceTotal : null,
      suggestedPayoutAmount: null,
      settlementId: settlement.id,
      settlementStatus: trim(settlement.status),
      stage: "needs_pay",
      stageLabel: "支払待ち",
      nextActionLabel: "支払処理",
      veShareAmount: settlement.veShareAmount,
      adjustmentTotalAmount: settlement.adjustmentTotalAmount,
      payoutAmount: settlement.payoutAmount,
      scheduledPayoutDate: settlement.scheduledPayoutDate,
      priorityRank: 1,
      payeeKey,
      periodKey: settlement.scheduledPayoutDate
        ? monthKey(settlement.scheduledPayoutDate)
        : monthKey(finance.actualDate),
      caseHref: `/cases/${input.caseId}?tab=settlement`,
      printHref: `/dealer-settlements/${settlement.id}/print`,
    };
  }

  return null;
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
