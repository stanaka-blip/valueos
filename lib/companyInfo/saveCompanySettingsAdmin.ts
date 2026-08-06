import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import type { CompanySettingsSaveBody } from "./companySettingsDto";
import {
  saveCompanySettingsWithClient,
  type SaveCompanySettingsResult,
} from "./saveCompanySettingsAdminCore";

export type { SaveCompanySettingsResult } from "./saveCompanySettingsAdminCore";

/**
 * 会社情報を service_role で upsert する。
 * ブラウザから import しないこと。
 */
export async function saveCompanySettingsAdmin(
  body: CompanySettingsSaveBody,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<SaveCompanySettingsResult> {
  try {
    return await saveCompanySettingsWithClient(body, client);
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
      error_code: "COMPANY_SETTINGS_SAVE_FAILED",
      error_message: "会社情報を保存できませんでした",
    };
  }
}
