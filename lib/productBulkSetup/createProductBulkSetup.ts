import "server-only";

import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  createProductBulkSetupWithClient,
  type CreateProductBulkSetupResult,
} from "./createProductBulkSetupCore";
import type { CreateProductBulkSetupBody } from "./createProductBulkSetupLogic";

export async function createProductBulkSetup(
  requestId: string,
  body: CreateProductBulkSetupBody | Record<string, unknown>
): Promise<CreateProductBulkSetupResult> {
  try {
    const client = getServiceRoleSupabase();
    return await createProductBulkSetupWithClient(requestId, body, client);
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
        request_id: requestId,
      };
    }
    throw e;
  }
}
