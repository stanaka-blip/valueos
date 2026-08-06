import type { SupabaseClient } from "@supabase/supabase-js";

import type { CompanySettingsRow, Database } from "@/lib/database.types";

import {
  normalizeCompanySettingsSaveBody,
  toCompanySettingsDto,
  type CompanySettingsSaveBody,
  type SaveCompanySettingsResult,
} from "./companySettingsDto";

export type { SaveCompanySettingsResult } from "./companySettingsDto";

export async function saveCompanySettingsWithClient(
  body: CompanySettingsSaveBody,
  client: SupabaseClient<Database>
): Promise<SaveCompanySettingsResult> {
  const normalized = normalizeCompanySettingsSaveBody(body);
  if (!normalized.ok) {
    return normalized;
  }

  const { data, error } = await client
    .from("company_settings")
    .upsert(
      {
        id: true,
        ...normalized.data,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error_code: "COMPANY_SETTINGS_SAVE_FAILED",
      error_message: "会社情報を保存できませんでした",
    };
  }

  return {
    ok: true,
    data: toCompanySettingsDto(data as CompanySettingsRow),
  };
}
