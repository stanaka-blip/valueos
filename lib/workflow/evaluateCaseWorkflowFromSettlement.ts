/**
 * 決済行（admin読取結果）から Workflow を評価する純関数。
 * 取得失敗と「本当の未設定」を混同しない。
 */

import type { CaseSettlementRow } from "@/lib/database.types";
import type { AdminSettlementReadResult } from "@/lib/caseSettlements/getCaseSettlementAdminCore";
import { buildWorkflowContext } from "@/lib/workflow/buildContext";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import type { WorkflowResult } from "@/lib/workflow/types";

export type CaseWorkflowRelatedData = {
  constructionCompletedDate: string | null;
  orders: ReadonlyArray<{
    id: string;
    status?: string | null;
    delivered_date?: string | null;
  }>;
  invoices: ReadonlyArray<{
    id: string;
    status?: string | null;
    invoice_amount?: number | null;
  }>;
  payments: ReadonlyArray<{
    id: string;
    invoice_id?: string | null;
    status?: string | null;
    payment_amount?: number | null;
  }>;
};

export type EvaluateCaseWorkflowFromSettlementResult =
  | {
      ok: true;
      result: WorkflowResult;
      /** true: case_settlements 行が存在しない（本当の未設定） */
      settlementMissing: boolean;
      settlement: CaseSettlementRow | null;
    }
  | {
      ok: false;
      error_code: "SETTLEMENT_READ_FAILED" | "CONFIG_ERROR" | "RELATED_READ_FAILED";
      error_message: string;
    };

/**
 * admin 決済読取結果を Workflow 評価へ変換。
 * settlementResult.ok === false → 評価せずエラー（未設定扱いにしない）。
 */
export function evaluateCaseWorkflowFromSettlement(input: {
  settlementResult: AdminSettlementReadResult;
  related: CaseWorkflowRelatedData;
  relatedError?: string | null;
}): EvaluateCaseWorkflowFromSettlementResult {
  if (input.relatedError) {
    return {
      ok: false,
      error_code: "RELATED_READ_FAILED",
      error_message: input.relatedError,
    };
  }

  if (!input.settlementResult.ok) {
    return {
      ok: false,
      error_code: input.settlementResult.error_code,
      error_message: input.settlementResult.error_message,
    };
  }

  const settlement = input.settlementResult.data;
  const ctx = buildWorkflowContext({
    settlement,
    constructionCompletedDate: input.related.constructionCompletedDate,
    orders: input.related.orders,
    invoices: input.related.invoices,
    payments: input.related.payments,
  });

  return {
    ok: true,
    result: evaluateWorkflow(ctx),
    settlementMissing: settlement == null,
    settlement,
  };
}
