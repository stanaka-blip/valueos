import type { CompanySettingsRow } from "@/lib/database.types";

/** 正式社名（seed / fallback 共通） */
export const DEFAULT_COMPANY_NAME = "株式会社Value Ecology";

/**
 * DB 行がないときの安全な fallback。
 * 仮の登録番号・振込先は入れない。
 */
export function createDefaultCompanySettings(): CompanySettingsRow {
  return {
    id: true,
    company_name: DEFAULT_COMPANY_NAME,
    postal_code: null,
    address: null,
    phone: null,
    fax: null,
    email: null,
    invoice_registration_number: null,
    bank_name: null,
    bank_branch: null,
    bank_account_type: null,
    bank_account_number: null,
    bank_account_holder: null,
    created_at: "",
    updated_at: "",
  };
}

export type AdminCompanySettingsReadResult =
  | {
      ok: true;
      data: CompanySettingsRow;
      /** db: 実行 / fallback: 行なしで社名のみ補完 */
      source: "db" | "fallback";
    }
  | {
      ok: false;
      error_code: "CONFIG_ERROR" | "COMPANY_SETTINGS_READ_FAILED";
      error_message: string;
    };
