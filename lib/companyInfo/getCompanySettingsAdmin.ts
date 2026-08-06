import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import { getCompanySettingsWithClient } from "./getCompanySettingsAdminCore";
import type { AdminCompanySettingsReadResult } from "./types";

export type { AdminCompanySettingsReadResult } from "./types";
export {
  DEFAULT_COMPANY_NAME,
  createDefaultCompanySettings,
} from "./types";

/**
 * 会社情報を service_role で取得する。
 * ブラウザ・クライアントコンポーネントから import しないこと。
 * 行なし → 正式社名のみの fallback（仮の登録番号・口座は補完しない）。
 * DB エラーは未登録扱いしない。
 */
export async function getCompanySettingsAdmin(
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<AdminCompanySettingsReadResult> {
  try {
    return await getCompanySettingsWithClient(client);
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
      error_code: "COMPANY_SETTINGS_READ_FAILED",
      error_message: "会社情報の取得に失敗しました",
    };
  }
}
