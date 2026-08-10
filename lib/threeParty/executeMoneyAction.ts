import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";
import type { ValidatedMoneyAction } from "@/lib/threeParty/moneyActionsLogic";

import {
  executeMoneyActionWithClient,
  type ExecuteMoneyActionResult,
} from "./executeMoneyActionCore";

export type { ExecuteMoneyActionResult } from "./executeMoneyActionCore";

/** service_role はサーバー内のみ。ブラウザ直 insert はしない。 */
export async function executeMoneyAction(
  requestId: string,
  action: ValidatedMoneyAction,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<ExecuteMoneyActionResult> {
  try {
    return await executeMoneyActionWithClient(requestId, action, client);
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
        request_id: requestId,
      };
    }
    return {
      ok: false,
      error_code: "ACTION_FAILED",
      error_message: "処理に失敗しました",
      request_id: requestId,
    };
  }
}
