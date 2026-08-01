import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  getCaseSettlementByCaseIdWithClient,
  type AdminSettlementReadResult,
} from "./getCaseSettlementAdminCore";

export type { AdminSettlementReadResult } from "./getCaseSettlementAdminCore";

/**
 * 案件詳細向け: case_settlements を service_role で取得。
 * 読取失敗は data:null（未設定）と同一視しない。
 */
export async function getCaseSettlementByCaseIdAdmin(
  caseId: string,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<AdminSettlementReadResult> {
  try {
    return await getCaseSettlementByCaseIdWithClient(caseId, client);
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
      error_code: "SETTLEMENT_READ_FAILED",
      error_message: "決済条件の取得に失敗しました",
    };
  }
}
