import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import type { SettlementSaveBody } from "./settlementSaveLogic";
import {
  saveCaseSettlementByCaseIdWithClient,
  type SaveCaseSettlementResult,
} from "./saveCaseSettlementCore";

export type { SaveCaseSettlementResult } from "./saveCaseSettlementCore";

/**
 * case_id 単位で INSERT/UPDATE。service role クライアント必須。
 */
export async function saveCaseSettlementByCaseId(
  caseId: string,
  body: SettlementSaveBody,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<SaveCaseSettlementResult> {
  try {
    return await saveCaseSettlementByCaseIdWithClient(caseId, body, client);
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      };
    }
    return {
      ok: false,
      error_code: "SETTLEMENT_SAVE_FAILED",
      error_message: "決済条件を保存できませんでした",
    };
  }
}
