import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  createPackageBulkSetupWithClient,
  type CreatePackageBulkSetupResult,
} from "./createPackageBulkSetupCore";
import type { CreatePackageBulkSetupBody } from "./createPackageBulkSetupLogic";

export type { CreatePackageBulkSetupResult } from "./createPackageBulkSetupCore";

export async function createPackageBulkSetup(
  requestId: string,
  body: CreatePackageBulkSetupBody | Record<string, unknown>,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<CreatePackageBulkSetupResult> {
  try {
    return await createPackageBulkSetupWithClient(requestId, body, client);
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
      error_code: "PACKAGE_BULK_SETUP_FAILED",
      error_message: "パッケージを一括登録できませんでした",
    };
  }
}
