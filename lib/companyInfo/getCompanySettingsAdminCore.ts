import type { SupabaseClient } from "@supabase/supabase-js";

import type { CompanySettingsRow, Database } from "@/lib/database.types";

import {
  createDefaultCompanySettings,
  type AdminCompanySettingsReadResult,
} from "./types";

export type { AdminCompanySettingsReadResult } from "./types";

/**
 * クエリ結果を Admin 読取結果へ変換（DB I/O なし・テスト可能）。
 * エラー時は fallback しない。行なしのみ fallback。
 */
export function resolveCompanySettingsRead(input: {
  data: CompanySettingsRow | null;
  errorMessage: string | null;
}): AdminCompanySettingsReadResult {
  if (input.errorMessage) {
    return {
      ok: false,
      error_code: "COMPANY_SETTINGS_READ_FAILED",
      error_message: "会社情報の取得に失敗しました",
    };
  }

  if (!input.data) {
    return {
      ok: true,
      data: createDefaultCompanySettings(),
      source: "fallback",
    };
  }

  return {
    ok: true,
    data: input.data,
    source: "db",
  };
}

/** service_role クライアントで company_settings を取得（注入可能） */
export async function getCompanySettingsWithClient(
  client: SupabaseClient<Database>
): Promise<AdminCompanySettingsReadResult> {
  const { data, error } = await client
    .from("company_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  return resolveCompanySettingsRead({
    data: (data as CompanySettingsRow | null) ?? null,
    errorMessage: error?.message ?? null,
  });
}
