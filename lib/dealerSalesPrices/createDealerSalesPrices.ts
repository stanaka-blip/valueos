import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  createDealerSalesPricesWithClient,
  type CreateDealerSalesPricesResult,
} from "./createDealerSalesPricesCore";
import type { CreateDealerSalesPricesBody } from "./createDealerSalesPricesLogic";

export type { CreateDealerSalesPricesResult } from "./createDealerSalesPricesCore";

export async function createDealerSalesPrices(
  requestId: string,
  body: CreateDealerSalesPricesBody | Record<string, unknown>,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<CreateDealerSalesPricesResult> {
  try {
    return await createDealerSalesPricesWithClient(requestId, body, client);
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
      error_code: "DEALER_SALES_PRICE_BULK_FAILED",
      error_message: "販売価格を一括登録できませんでした",
    };
  }
}
