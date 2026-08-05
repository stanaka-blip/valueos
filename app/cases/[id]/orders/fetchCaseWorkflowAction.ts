"use server";

import { cookies } from "next/headers";

import {
  AUTH_COOKIE_NAME,
  isUuid,
  unsealStaffSession,
} from "@/lib/gateway/authCookie";
import { loadCaseWorkflowAdmin } from "@/lib/workflow/loadCaseWorkflowAdmin";
import type { WorkflowResult } from "@/lib/workflow/types";

export type FetchCaseWorkflowActionResult =
  | {
      ok: true;
      result: WorkflowResult;
      settlementMissing: boolean;
    }
  | {
      ok: false;
      error_code:
        | "UNAUTHORIZED"
        | "BAD_REQUEST"
        | "SETTLEMENT_READ_FAILED"
        | "CONFIG_ERROR"
        | "RELATED_READ_FAILED";
      error_message: string;
    };

/**
 * 発注登録画面向け: 認証済みスタッフのみ、admin 決済読取で Workflow を返す。
 */
export async function fetchCaseWorkflowAction(
  caseId: string
): Promise<FetchCaseWorkflowActionResult> {
  if (!caseId || !isUuid(caseId)) {
    return {
      ok: false,
      error_code: "BAD_REQUEST",
      error_message: "案件IDが不正です",
    };
  }

  const cookieStore = await cookies();
  const session = unsealStaffSession(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );
  if (!session) {
    return {
      ok: false,
      error_code: "UNAUTHORIZED",
      error_message: "認証が必要です",
    };
  }

  const loaded = await loadCaseWorkflowAdmin(caseId);
  if (!loaded.ok) {
    return {
      ok: false,
      error_code: loaded.error_code,
      error_message: loaded.error_message,
    };
  }

  return {
    ok: true,
    result: loaded.result,
    settlementMissing: loaded.settlementMissing,
  };
}
