/**
 * 発注登録クライアントから Server Action 経由で Workflow を取得する。
 * anon クライアント直読みは使わない。
 */

import { fetchCaseWorkflowAction } from "./fetchCaseWorkflowAction";
import type { WorkflowResult } from "@/lib/workflow/types";

export type FetchCaseWorkflowClientResult =
  | {
      ok: true;
      result: WorkflowResult;
      settlementMissing: boolean;
    }
  | {
      ok: false;
      error_code: string;
      error_message: string;
    };

export async function fetchCaseWorkflowForOrderPage(
  caseId: string
): Promise<FetchCaseWorkflowClientResult> {
  try {
    return await fetchCaseWorkflowAction(caseId);
  } catch {
    return {
      ok: false,
      error_code: "SETTLEMENT_READ_FAILED",
      error_message: "決済条件の取得に失敗しました",
    };
  }
}
