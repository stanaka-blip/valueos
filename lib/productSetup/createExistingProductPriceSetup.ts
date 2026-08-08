import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  createExistingProductPriceSetupWithClient,
  type CreateExistingProductPriceSetupResult,
} from "./createExistingProductPriceSetupCore";
import type { CreateExistingProductPriceSetupBody } from "./createExistingProductPriceSetupLogic";

export type { CreateExistingProductPriceSetupResult } from "./createExistingProductPriceSetupCore";

export async function createExistingProductPriceSetup(
  requestId: string,
  body: CreateExistingProductPriceSetupBody | Record<string, unknown>,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<CreateExistingProductPriceSetupResult> {
  try {
    return await createExistingProductPriceSetupWithClient(
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
      error_code: "PRODUCT_PRICE_SETUP_FAILED",
      error_message: "価格セットアップを登録できませんでした",
    };
  }
}
