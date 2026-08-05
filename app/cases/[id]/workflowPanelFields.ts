import type { SettlementSaveBody } from "@/lib/caseSettlements/settlementSaveLogic";
import type { WorkflowMeta } from "@/lib/workflow/workflowMeta";

import type { SettlementViewData } from "./settlementView";

export type WorkflowPanelFieldVisibility = {
  showLoanStatus: boolean;
  showCardStatus: boolean;
  showCompletionDate: boolean;
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
    };
  }

  if (type === "カード") {
    return {
      showLoanStatus: false,
      showCardStatus: true,
      showCompletionDate: true,
    };
  }

  // 前金 / 売掛 / その他 / 未設定
  return {
    showLoanStatus: false,
    showCardStatus: false,
    showCompletionDate: true,
  };
}

export function workflowPanelInputGridClass(
  visibility: WorkflowPanelFieldVisibility
): string {
  const count =
    Number(visibility.showLoanStatus) +
    Number(visibility.showCardStatus) +
    Number(visibility.showCompletionDate);

  if (count <= 1) return "sm:grid-cols-1";
  if (count === 2) return "sm:grid-cols-2";
  return "sm:grid-cols-3";
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
}): WorkflowMeta {
  const meta: WorkflowMeta = {
    construction_completed_date: options.completedDate || null,
  };

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
