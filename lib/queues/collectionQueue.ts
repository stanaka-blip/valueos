/**
 * 回収管理キュー（/queues/collections）の純関数。
 * DB I/O なし。決済区分ごとの表示・除外・並び。
 *
 * 金額・入金・納品・カード/ローン判定は既存関数を再利用する。
 * 台帳系の未整備概念（Phase4範囲外）は扱わない。
 */

import {
  isActiveCaseStatus,
  isActiveInvoiceStatus,
} from "@/lib/status/activeRecords";
import {
  sumConfirmedPaidAmount,
  summarizeInvoicePayments,
} from "@/lib/payments/invoicePaymentStatus";
import {
  areAllOrdersDelivered,
  computeCreditDates,
} from "@/lib/workflow/conditions";
import { resolveSettlementRule } from "@/lib/workflow/normalize";
import {
  CARD_SUCCESS_STATUSES,
  LOAN_APPROVED_STATUSES,
} from "@/lib/workflow/statusCatalog";
import type { SettlementRuleKey } from "@/lib/workflow/settlementRules";

export type CollectionQueueInvoiceInput = {
  id: string;
  status?: string | null;
  invoice_amount?: number | null;
  due_date?: string | null;
};

export type CollectionQueuePaymentInput = {
  id: string;
  status?: string | null;
  payment_amount?: number | null;
  invoice_id?: string | null;
};

export type CollectionQueueOrderInput = {
  id: string;
  status?: string | null;
  delivered_date?: string | null;
};

export type CollectionQueueFinanceReceiptInput = {
  id: string;
  status?: string | null;
};

export type CollectionQueueCaseInput = {
  id: string;
  case_no: string | null;
  status: string | null;
  customer_name: string | null;
  order_received_date: string | null;
  dealer_name: string | null;
  settlement_type: string | null;
  deposit_amount: number | null;
  loan_status: string | null;
  card_status: string | null;
  approval_number: string | null;
  /** 完工日（未登録なら null） */
  construction_completed_date?: string | null;
  orders: ReadonlyArray<CollectionQueueOrderInput>;
  invoices: ReadonlyArray<CollectionQueueInvoiceInput>;
  payments: ReadonlyArray<CollectionQueuePaymentInput>;
  /** 信販入金（3社間）。service_role 読取前提 */
  finance_receipts?: ReadonlyArray<CollectionQueueFinanceReceiptInput>;
  today?: string;
};

/** UI分類（DBステータスではない。既存 stateLabel からの表示マッピング） */
export type CollectionUiCategory =
  | "invoice_pending"
  | "payment_waiting"
  | "partial_payment"
  | "overdue"
  | "settlement_review";

export type CollectionQueueRow = {
  id: string;
  caseNo: string;
  customerName: string;
  dealerName: string;
  settlementType: string;
  /** 決済区分ごとの既存金額（前金=必要入金額 等）。一覧の請求額列とは別 */
  amountLabel: string | null;
  amount: number | null;
  stateLabel: string;
  /** 一覧「状態」列の表示文言 */
  displayStateLabel: string;
  uiCategory: CollectionUiCategory;
  /** 有効請求の合計。カード/3社間/請求なしは null */
  invoiceAmount: number | null;
  confirmedPaidAmount: number | null;
  remainingAmount: number | null;
  nextAction: string;
  dueDate: string | null;
  isOverdue: boolean;
  orderReceivedDate: string | null;
  detailHref: string;
  secondaryHref: string | null;
  /** PR #95 のリンク文言（ロジック側）。画面 CTA は ctaLabel を優先 */
  secondaryLabel: string | null;
  ctaLabel: string | null;
};

export type CollectionQueueSummary = {
  invoicePendingCount: number;
  paymentWaitingCount: number;
  paymentWaitingRemaining: number;
  partialPaymentCount: number;
  partialPaymentRemaining: number;
  overdueCount: number;
  overdueRemaining: number;
  settlementReviewCount: number;
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function todayString(today?: string): string {
  if (today) return today;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function activeInvoicesForCollection<
  T extends { status?: string | null },
>(invoices: ReadonlyArray<T>): T[] {
  return invoices.filter((inv) => isActiveInvoiceStatus(inv.status));
}

/**
 * 未収の有効請求。
 * - 取消請求は除外（activeInvoicesForCollection）
 * - 確認済入金が請求額に達した請求は除外
 * - 一部入金は未収として残す
 */
export function unpaidActiveInvoicesForCollection(
  invoices: ReadonlyArray<CollectionQueueInvoiceInput>,
  payments: ReadonlyArray<CollectionQueuePaymentInput>
): CollectionQueueInvoiceInput[] {
  return activeInvoicesForCollection(invoices).filter((inv) => {
    const invPayments = payments.filter((p) => p.invoice_id === inv.id);
    const summary = summarizeInvoicePayments({
      invoiceAmount: inv.invoice_amount,
      dueDate: inv.due_date,
      payments: paymentInputs(invPayments),
    });
    return summary.paymentStatus !== "入金済";
  });
}

/** 入金系 secondary ボタンの href / 文言（状態判定自体は変えない） */
export function resolveCollectionPaymentSecondary(
  caseId: string,
  unpaidInvoices: ReadonlyArray<CollectionQueueInvoiceInput>
): { secondaryHref: string; secondaryLabel: string } {
  if (unpaidInvoices.length === 1) {
    return {
      secondaryHref: `/invoices/${unpaidInvoices[0].id}/payments/new`,
      secondaryLabel: "入金登録",
    };
  }
  return {
    secondaryHref: `/cases/${caseId}?tab=invoice`,
    secondaryLabel: "請求・入金",
  };
}

/** 既存 stateLabel → UIカテゴリ（除外判定は変えない） */
export function resolveCollectionUiCategory(
  stateLabel: string
): CollectionUiCategory {
  switch (stateLabel) {
    case "請求待ち":
      return "invoice_pending";
    case "期限超過":
      return "overdue";
    case "一部入金":
      return "partial_payment";
    case "カード決済待ち":
    case "審査承認待ち":
    case "完工待ち":
      return "settlement_review";
    case "信販入金待ち":
    case "入金待ち":
    case "未入金":
      return "payment_waiting";
    default:
      return "payment_waiting";
  }
}

export function resolveCollectionDisplayStateLabel(
  stateLabel: string,
  uiCategory: CollectionUiCategory
): string {
  // 3社間の次アクション文言は潰さない
  if (stateLabel === "信販入金待ち" || stateLabel === "完工待ち") {
    return stateLabel;
  }
  if (uiCategory === "payment_waiting") return "入金待ち";
  if (uiCategory === "settlement_review") {
    return stateLabel;
  }
  if (uiCategory === "invoice_pending") return "請求待ち";
  if (uiCategory === "partial_payment") return "一部入金";
  if (uiCategory === "overdue") return "期限超過";
  return stateLabel;
}

/** CTA表示文言。href は secondaryHref（PR #95）のまま */
export function resolveCollectionCtaLabel(
  secondaryLabel: string | null,
  uiCategory: CollectionUiCategory
): string | null {
  if (!secondaryLabel) return null;
  if (uiCategory === "invoice_pending") return "請求書を作成";
  if (uiCategory === "partial_payment") return "追加入金";
  return secondaryLabel;
}

/**
 * 一覧・サマリー用の請求金額。
 * 前金の deposit / カード・3社間は推測せず null（—）。
 */
export function resolveCollectionInvoiceMoney(
  input: Pick<CollectionQueueCaseInput, "invoices" | "payments">,
  settlementType: string
): {
  invoiceAmount: number | null;
  confirmedPaidAmount: number | null;
  remainingAmount: number | null;
} {
  if (settlementType === "カード" || settlementType === "3社間決済") {
    return {
      invoiceAmount: null,
      confirmedPaidAmount: null,
      remainingAmount: null,
    };
  }

  const invoices = activeInvoicesForCollection(input.invoices);
  if (invoices.length === 0) {
    return {
      invoiceAmount: null,
      confirmedPaidAmount: null,
      remainingAmount: null,
    };
  }

  const invoiceAmount = invoices.reduce(
    (sum, inv) => sum + Math.max(0, toNumber(inv.invoice_amount)),
    0
  );
  const confirmedPaidAmount = sumConfirmedPaidAmount(
    paymentInputs(input.payments)
  );
  const remainingAmount = Math.max(0, invoiceAmount - confirmedPaidAmount);
  return { invoiceAmount, confirmedPaidAmount, remainingAmount };
}

export function buildCollectionQueueSummary(
  rows: ReadonlyArray<
    Pick<CollectionQueueRow, "uiCategory" | "remainingAmount">
  >
): CollectionQueueSummary {
  const summary: CollectionQueueSummary = {
    invoicePendingCount: 0,
    paymentWaitingCount: 0,
    paymentWaitingRemaining: 0,
    partialPaymentCount: 0,
    partialPaymentRemaining: 0,
    overdueCount: 0,
    overdueRemaining: 0,
    settlementReviewCount: 0,
  };

  for (const row of rows) {
    const remaining = row.remainingAmount ?? 0;
    switch (row.uiCategory) {
      case "invoice_pending":
        summary.invoicePendingCount += 1;
        break;
      case "payment_waiting":
        summary.paymentWaitingCount += 1;
        summary.paymentWaitingRemaining += remaining;
        break;
      case "partial_payment":
        summary.partialPaymentCount += 1;
        summary.partialPaymentRemaining += remaining;
        break;
      case "overdue":
        summary.overdueCount += 1;
        summary.overdueRemaining += remaining;
        break;
      case "settlement_review":
        summary.settlementReviewCount += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

const UI_CATEGORY_RANK: Record<CollectionUiCategory, number> = {
  overdue: 0,
  invoice_pending: 1,
  partial_payment: 2,
  payment_waiting: 3,
  settlement_review: 4,
};

/** 前金完了: isPaymentConfirmedFromBilling と同趣旨 */
export function isAdvancePaymentComplete(input: {
  depositAmount: number | null | undefined;
  payments: ReadonlyArray<CollectionQueuePaymentInput>;
}): boolean {
  const paid = sumConfirmedPaidAmount(
    input.payments.map((p) => ({
      paymentAmount: toNumber(p.payment_amount),
      status: p.status,
    }))
  );
  const deposit = input.depositAmount;
  if (deposit != null && Number.isFinite(deposit) && deposit > 0) {
    return paid >= deposit;
  }
  return paid > 0;
}

export function isCardSettlementComplete(
  cardStatus: string | null | undefined
): boolean {
  const v = (cardStatus || "").trim();
  return (CARD_SUCCESS_STATUSES as readonly string[]).includes(v);
}

export function isLoanApprovalComplete(input: {
  loanStatus: string | null | undefined;
  approvalNumber: string | null | undefined;
}): boolean {
  const loan = (input.loanStatus || "").trim();
  const approved = (LOAN_APPROVED_STATUSES as readonly string[]).includes(loan);
  const hasNumber = Boolean((input.approvalNumber || "").trim());
  return approved && hasNumber;
}

/** 信販入金済が1件でもあれば true（取消以外の入金済） */
export function hasPaidFinanceReceipt(
  receipts: ReadonlyArray<CollectionQueueFinanceReceiptInput> | null | undefined
): boolean {
  return (receipts || []).some((r) => (r.status || "").trim() === "入金済");
}

function hasConstructionCompletedDate(
  value: string | null | undefined
): boolean {
  return Boolean((value || "").trim());
}

function paymentInputs(
  payments: ReadonlyArray<CollectionQueuePaymentInput>
) {
  return payments.map((p) => ({
    paymentAmount: toNumber(p.payment_amount),
    status: p.status,
  }));
}

function evaluateAdvance(input: CollectionQueueCaseInput): CollectionQueueRow | null {
  if (isAdvancePaymentComplete({
    depositAmount: input.deposit_amount,
    payments: input.payments,
  })) {
    return null;
  }

  const invoices = activeInvoicesForCollection(input.invoices);
  const paid = sumConfirmedPaidAmount(paymentInputs(input.payments));
  const deposit = input.deposit_amount;
  const required =
    deposit != null && Number.isFinite(deposit) && deposit > 0
      ? deposit
      : null;

  let stateLabel: string;
  let nextAction: string;
  let secondaryHref: string | null;
  let secondaryLabel: string | null;

  if (invoices.length === 0) {
    stateLabel = "請求待ち";
    nextAction = "請求書を作成";
    secondaryHref = `/cases/${input.id}/invoices/new`;
    secondaryLabel = "請求作成";
  } else if (paid <= 0) {
    stateLabel = "未入金";
    nextAction = "入金確認";
    ({ secondaryHref, secondaryLabel } = resolveCollectionPaymentSecondary(
      input.id,
      unpaidActiveInvoicesForCollection(input.invoices, input.payments)
    ));
  } else {
    stateLabel = "一部入金";
    nextAction = "残額確認";
    ({ secondaryHref, secondaryLabel } = resolveCollectionPaymentSecondary(
      input.id,
      unpaidActiveInvoicesForCollection(input.invoices, input.payments)
    ));
  }

  return baseRow(input, {
    settlementType: "前金",
    amountLabel: required != null ? "必要入金額" : null,
    amount: required,
    stateLabel,
    nextAction,
    dueDate: null,
    isOverdue: false,
    secondaryHref,
    secondaryLabel,
  });
}

function evaluateCredit(input: CollectionQueueCaseInput): CollectionQueueRow | null {
  const orders = input.orders.map((o) => ({
    id: o.id,
    status: o.status ?? null,
    deliveredDate: o.delivered_date ?? null,
  }));

  if (!areAllOrdersDelivered(orders)) {
    return null;
  }

  const invoices = activeInvoicesForCollection(input.invoices);
  const creditDates = computeCreditDates(orders);
  const today = todayString(input.today);

  if (invoices.length === 0) {
    return baseRow(input, {
      settlementType: "売掛",
      amountLabel: null,
      amount: null,
      stateLabel: "請求待ち",
      nextAction: "請求書を作成",
      dueDate: creditDates.paymentDueDate,
      isOverdue: Boolean(
        creditDates.paymentDueDate && creditDates.paymentDueDate < today
      ),
      secondaryHref: `/cases/${input.id}/invoices/new`,
      secondaryLabel: "請求作成",
    });
  }

  const invoiceAmount = invoices.reduce(
    (sum, inv) => sum + Math.max(0, toNumber(inv.invoice_amount)),
    0
  );
  const dueDates = invoices
    .map((inv) => (inv.due_date || "").trim())
    .filter(Boolean)
    .sort();
  const dueDate =
    dueDates[0] || creditDates.paymentDueDate || null;

  const summary = summarizeInvoicePayments({
    invoiceAmount,
    dueDate,
    payments: paymentInputs(input.payments),
    today,
  });

  if (summary.paymentStatus === "入金済") {
    return null;
  }

  let stateLabel: string;
  let nextAction: string;
  if (summary.isOverdue) {
    stateLabel = "期限超過";
    nextAction = "催促";
  } else if (summary.paymentStatus === "一部入金") {
    stateLabel = "一部入金";
    nextAction = "入金確認";
  } else {
    stateLabel = "入金待ち";
    nextAction = "入金確認";
  }

  const paymentSecondary = resolveCollectionPaymentSecondary(
    input.id,
    unpaidActiveInvoicesForCollection(input.invoices, input.payments)
  );

  return baseRow(input, {
    settlementType: "売掛",
    amountLabel: "請求額",
    amount: invoiceAmount,
    stateLabel,
    nextAction,
    dueDate,
    isOverdue: summary.isOverdue,
    secondaryHref: paymentSecondary.secondaryHref,
    secondaryLabel: paymentSecondary.secondaryLabel,
  });
}

function evaluateCard(input: CollectionQueueCaseInput): CollectionQueueRow | null {
  if (isCardSettlementComplete(input.card_status)) {
    return null;
  }
  return baseRow(input, {
    settlementType: "カード",
    amountLabel: null,
    amount: null,
    stateLabel: "カード決済待ち",
    nextAction: "決済処理・承認確認",
    dueDate: null,
    isOverdue: false,
    secondaryHref: `/cases/${input.id}`,
    secondaryLabel: "案件詳細",
  });
}

function evaluateLoan(input: CollectionQueueCaseInput): CollectionQueueRow | null {
  // 既存: ローン未完了は審査待ち（請求・入金フェーズより前）
  if (
    !isLoanApprovalComplete({
      loanStatus: input.loan_status,
      approvalNumber: input.approval_number,
    })
  ) {
    const approved = (LOAN_APPROVED_STATUSES as readonly string[]).includes(
      (input.loan_status || "").trim()
    );
    const hasNumber = Boolean((input.approval_number || "").trim());

    let nextAction = "審査状況確認";
    if (approved && !hasNumber) {
      nextAction = "承認番号確認";
    }

    return baseRow(input, {
      settlementType: "3社間決済",
      amountLabel: null,
      amount: null,
      stateLabel: "審査承認待ち",
      nextAction,
      dueDate: null,
      isOverdue: false,
      secondaryHref: `/cases/${input.id}`,
      secondaryLabel: "案件詳細",
    });
  }

  // 仕様優先:
  // 1 完工待ち → 2 請求待ち → 3 信販入金待ち → 4 入金済で除外
  if (!hasConstructionCompletedDate(input.construction_completed_date)) {
    return baseRow(input, {
      settlementType: "3社間決済",
      amountLabel: null,
      amount: null,
      stateLabel: "完工待ち",
      nextAction: "完工日を登録",
      dueDate: null,
      isOverdue: false,
      secondaryHref: `/cases/${input.id}`,
      secondaryLabel: "案件詳細",
    });
  }

  const invoices = activeInvoicesForCollection(input.invoices);
  if (invoices.length === 0) {
    return baseRow(input, {
      settlementType: "3社間決済",
      amountLabel: null,
      amount: null,
      stateLabel: "請求待ち",
      nextAction: "請求書を作成",
      dueDate: null,
      isOverdue: false,
      secondaryHref: `/cases/${input.id}/invoices/new`,
      secondaryLabel: "請求作成",
    });
  }

  if (hasPaidFinanceReceipt(input.finance_receipts)) {
    return null;
  }

  return baseRow(input, {
    settlementType: "3社間決済",
    amountLabel: null,
    amount: null,
    stateLabel: "信販入金待ち",
    nextAction: "信販入金を確認",
    dueDate: null,
    isOverdue: false,
    secondaryHref: `/cases/${input.id}?tab=settlement`,
    secondaryLabel: "案件詳細",
  });
}

function baseRow(
  input: CollectionQueueCaseInput,
  fields: {
    settlementType: string;
    amountLabel: string | null;
    amount: number | null;
    stateLabel: string;
    nextAction: string;
    dueDate: string | null;
    isOverdue: boolean;
    secondaryHref: string | null;
    secondaryLabel: string | null;
  }
): CollectionQueueRow {
  const uiCategory = resolveCollectionUiCategory(fields.stateLabel);
  const money = resolveCollectionInvoiceMoney(input, fields.settlementType);
  return {
    id: input.id,
    caseNo: input.case_no || "—",
    customerName: input.customer_name || "—",
    dealerName: input.dealer_name || "—",
    settlementType: fields.settlementType,
    amountLabel: fields.amountLabel,
    amount: fields.amount,
    stateLabel: fields.stateLabel,
    displayStateLabel: resolveCollectionDisplayStateLabel(
      fields.stateLabel,
      uiCategory
    ),
    uiCategory,
    invoiceAmount: money.invoiceAmount,
    confirmedPaidAmount: money.confirmedPaidAmount,
    remainingAmount: money.remainingAmount,
    nextAction: fields.nextAction,
    dueDate: fields.dueDate,
    isOverdue: fields.isOverdue,
    orderReceivedDate: input.order_received_date,
    detailHref: `/cases/${input.id}`,
    secondaryHref: fields.secondaryHref,
    secondaryLabel: fields.secondaryLabel,
    ctaLabel: resolveCollectionCtaLabel(fields.secondaryLabel, uiCategory),
  };
}

/** 決済区分ごとの回収キュー行。対象外・完了は null */
export function buildCollectionQueueRow(
  input: CollectionQueueCaseInput
): CollectionQueueRow | null {
  if (!isActiveCaseStatus(input.status)) return null;

  const rule = resolveSettlementRule(input.settlement_type);
  if (!rule) return null;

  const key = rule.key as SettlementRuleKey;
  switch (key) {
    case "前金":
      return evaluateAdvance(input);
    case "売掛":
      return evaluateCredit(input);
    case "カード":
      return evaluateCard(input);
    case "3社間決済":
      return evaluateLoan(input);
    default:
      return null;
  }
}

function dateSortKey(value: string | null | undefined): number {
  const v = (value || "").trim();
  if (!v) return Number.POSITIVE_INFINITY;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/**
 * 1. UIカテゴリ（期限超過 → 請求待ち → 一部入金 → 入金待ち → 決済・審査待ち）
 * 2. 同カテゴリ内: 期限超過フラグ（legacy）/ 対応期限が近い順 / 期限未設定は後
 * 3. 受付日が古い順
 * 4. 案件番号順
 */
export function sortCollectionQueueRows<
  T extends {
    isOverdue: boolean;
    dueDate: string | null;
    orderReceivedDate: string | null;
    caseNo: string;
    uiCategory?: CollectionUiCategory;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aRank =
      a.uiCategory != null
        ? UI_CATEGORY_RANK[a.uiCategory]
        : a.isOverdue
          ? 0
          : 1;
    const bRank =
      b.uiCategory != null
        ? UI_CATEGORY_RANK[b.uiCategory]
        : b.isOverdue
          ? 0
          : 1;
    if (aRank !== bRank) return aRank - bRank;

    if (a.uiCategory == null && b.uiCategory == null) {
      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1;
      }
    }

    const d = dateSortKey(a.dueDate) - dateSortKey(b.dueDate);
    if (d !== 0) return d;
    const r =
      dateSortKey(a.orderReceivedDate) - dateSortKey(b.orderReceivedDate);
    if (r !== 0) return r;
    return a.caseNo.localeCompare(b.caseNo, "ja");
  });
}
