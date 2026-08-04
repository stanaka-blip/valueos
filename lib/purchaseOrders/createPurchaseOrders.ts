import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  createPurchaseOrdersWithClient,
  type CreatePurchaseOrdersResult,
} from "./createPurchaseOrdersCore";
import type { CreatePurchaseOrdersBody } from "./createPurchaseOrdersLogic";

export type { CreatePurchaseOrdersResult } from "./createPurchaseOrdersCore";

/**
 * 仕入発注一括作成。
 * - service role はサーバー内のみ
 * - 実体は create_purchase_orders RPC（単一トランザクション）
 */
export async function createPurchaseOrdersByCaseId(
  caseId: string,
  requestId: string,
  body: CreatePurchaseOrdersBody | Record<string, unknown>,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<CreatePurchaseOrdersResult> {
  try {
    return await createPurchaseOrdersWithClient(
      caseId,
      requestId,
      body,
      client
    );
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
      error_code: "ORDER_CREATE_FAILED",
      error_message: "発注を登録できませんでした",
    };
  }
}
