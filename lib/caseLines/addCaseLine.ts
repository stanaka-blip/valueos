import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import type { AddCaseLineBody } from "./addCaseLineLogic";
import {
  addCaseLineByCaseIdWithClient,
  type AddCaseLineResult,
} from "./addCaseLineCore";

export type { AddCaseLineResult } from "./addCaseLineCore";

/**
 * 案件詳細の明細追加。service role はサーバー内のみ。
 */
export async function addCaseLineByCaseId(
  caseId: string,
  body: AddCaseLineBody,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<AddCaseLineResult> {
  try {
    return await addCaseLineByCaseIdWithClient(caseId, body, client);
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
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }
}
