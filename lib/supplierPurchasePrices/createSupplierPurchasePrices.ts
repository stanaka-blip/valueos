import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  createSupplierPurchasePricesWithClient,
  type CreateSupplierPurchasePricesResult,
} from "./createSupplierPurchasePricesCore";
import type { CreateSupplierPurchasePricesBody } from "./createSupplierPurchasePricesLogic";

export type { CreateSupplierPurchasePricesResult } from "./createSupplierPurchasePricesCore";

export async function createSupplierPurchasePrices(
  requestId: string,
  body: CreateSupplierPurchasePricesBody | Record<string, unknown>,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<CreateSupplierPurchasePricesResult> {
  try {
    return await createSupplierPurchasePricesWithClient(
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
      error_code: "SUPPLIER_PRICE_BULK_FAILED",
      error_message: "仕入価格を一括登録できませんでした",
    };
  }
}
