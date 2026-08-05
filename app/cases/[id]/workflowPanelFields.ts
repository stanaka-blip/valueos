import type { SettlementSaveBody } from "@/lib/caseSettlements/settlementSaveLogic";
import {
  CANCELLED_PAYMENT_STATUSES,
  CONFIRMED_PAYMENT_STATUSES,
} from "@/lib/payments/constants";
import type { WorkflowMeta } from "@/lib/workflow/workflowMeta";

import type { SettlementViewData } from "./settlementView";

export type WorkflowPanelPaymentInput = {
  paymentDate: string | null;
  status: string | null;
};

export type WorkflowPanelOrderInput = {
  deliveredDate: string | null;
  status: string;
};

export type WorkflowPanelFieldVisibility = {
  showLoanStatus: boolean;
  showCardStatus: boolean;
  showCompletionDate: boolean;
  showPaymentDate: boolean;
  showDeliveryDate: boolean;
};

/**
 * 決済区分に応じた業務ワークフロー入力欄の表示制御（表示専用）。
 */
export function resolveWorkflowPanelFieldVisibility(
  settlementType: string | null | undefined
): WorkflowPanelFieldVisibility {
  const type = (settlementType || "").trim();

  if (type === "3社間決済") {
    return {
      showLoanStatus: true,
      showCardStatus: false,
      showCompletionDate: true,
      showPaymentDate: false,
      showDeliveryDate: false,
    };
  }

  if (type === "カード") {
    return {
      showLoanStatus: false,
      showCardStatus: true,
      showCompletionDate: false,
      showPaymentDate: false,
      showDeliveryDate: false,
    };
  }

  if (type === "前金") {
    return {
      showLoanStatus: false,
      showCardStatus: false,
      showCompletionDate: false,
      showPaymentDate: true,
      showDeliveryDate: false,
    };
  }

  if (type === "売掛") {
    return {
      showLoanStatus: false,
      showCardStatus: false,
      showCompletionDate: false,
      showPaymentDate: false,
      showDeliveryDate: true,
    };
  }

  // その他 / 未設定
  return {
    showLoanStatus: false,
    showCardStatus: false,
    showCompletionDate: true,
    showPaymentDate: false,
    showDeliveryDate: false,
  };
}

/** 入金タブと同じ確認済入金の最終入金日 */
export function resolveLatestConfirmedPaymentDate(
  payments: ReadonlyArray<WorkflowPanelPaymentInput>
): string | null {
  let latest: string | null = null;

  for (const payment of payments) {
    const status = (payment.status || "").trim();
    if (!CONFIRMED_PAYMENT_STATUSES.has(status)) continue;
    if (CANCELLED_PAYMENT_STATUSES.has(status)) continue;
    const date = (payment.paymentDate || "").trim();
    if (!date) continue;
    if (!latest || date > latest) latest = date;
  }

  return latest;
}

/** 有効発注の最終納品日（orders.delivered_date の最大値） */
export function resolveLatestOrderDeliveryDate(
  orders: ReadonlyArray<WorkflowPanelOrderInput>
): string | null {
  let latest: string | null = null;

  for (const order of orders) {
    if (order.status === "キャンセル" || order.status === "取消") continue;
    const date = (order.deliveredDate || "").trim();
    if (!date) continue;
    if (!latest || date > latest) latest = date;
  }

  return latest;
}

export function workflowPanelInputGridClass(
  visibility: WorkflowPanelFieldVisibility
): string {
  const count =
    Number(visibility.showLoanStatus) +
    Number(visibility.showCardStatus) +
    Number(visibility.showCompletionDate) +
    Number(visibility.showPaymentDate) +
    Number(visibility.showDeliveryDate);

  if (count <= 1) return "sm:grid-cols-1";
  if (count === 2) return "sm:grid-cols-2";
  return "sm:grid-cols-3";
}

export function formatWorkflowPanelDate(
  value: string | null | undefined
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

/** 表示中の項目だけ workflow_panel 保存 payload に含める */
export function buildWorkflowPanelSaveBody(options: {
  settlement: SettlementViewData;
  visibility: WorkflowPanelFieldVisibility;
  loanStatus: string;
  cardStatus: string;
  now: string;
}): SettlementSaveBody {
  const body: SettlementSaveBody = {
    source: "workflow_panel",
    memo: options.settlement.memo || null,
  };

  if (options.visibility.showLoanStatus) {
    body.loan_status = options.loanStatus || null;
    body.loan_status_updated_at = options.now;
  }

  if (options.visibility.showCardStatus) {
    body.card_status = options.cardStatus || null;
    body.card_status_updated_at = options.now;
  }

  return body;
}

/** memo フォールバック用。非表示項目は既存値を維持する */
export function buildWorkflowPanelMetaPayload(options: {
  settlement: SettlementViewData;
  visibility: WorkflowPanelFieldVisibility;
  loanStatus: string;
  cardStatus: string;
  completedDate: string;
  existingConstructionCompletedDate: string | null;
}): WorkflowMeta {
  const meta: WorkflowMeta = {};

  if (options.visibility.showCompletionDate) {
    meta.construction_completed_date = options.completedDate || null;
  } else if (options.existingConstructionCompletedDate) {
    meta.construction_completed_date =
      options.existingConstructionCompletedDate;
  }

  if (options.visibility.showLoanStatus) {
    meta.loan_status = options.loanStatus || null;
  } else if (options.settlement.loanStatus) {
    meta.loan_status = options.settlement.loanStatus;
  }

  if (options.visibility.showCardStatus) {
    meta.card_status = options.cardStatus || null;
  } else if (options.settlement.cardStatus) {
    meta.card_status = options.settlement.cardStatus;
  }

  return meta;
}
