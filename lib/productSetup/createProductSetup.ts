import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  createProductSetupWithClient,
  type CreateProductSetupResult,
} from "./createProductSetupCore";
import type { CreateProductSetupBody } from "./createProductSetupLogic";

export type { CreateProductSetupResult } from "./createProductSetupCore";

/**
 * 商品セットアップ（商品 + 仕入価格複数 + 販売価格複数）。
 * - service role はサーバー内のみ
 * - 実体は create_product_setup RPC（単一トランザクション）
 */
export async function createProductSetup(
  requestId: string,
  body: CreateProductSetupBody | Record<string, unknown>,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<CreateProductSetupResult> {
  try {
    return await createProductSetupWithClient(requestId, body, client);
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
      error_code: "PRODUCT_SETUP_FAILED",
      error_message: "商品セットアップを登録できませんでした",
    };
  }
}
