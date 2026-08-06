import type { CompanySettingsRow } from "@/lib/database.types";

import { DEFAULT_COMPANY_NAME } from "./types";

/** API / 画面で扱う会社情報（シングルトン） */
export type CompanySettingsDto = {
  company_name: string;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  invoice_registration_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
};

export type CompanySettingsSaveBody = {
  company_name?: unknown;
  postal_code?: unknown;
  address?: unknown;
  phone?: unknown;
  fax?: unknown;
  email?: unknown;
  invoice_registration_number?: unknown;
  bank_name?: unknown;
  bank_branch?: unknown;
  bank_account_type?: unknown;
  bank_account_number?: unknown;
  bank_account_holder?: unknown;
};

export type SaveCompanySettingsResult =
  | { ok: true; data: CompanySettingsDto }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "CONFIG_ERROR"
        | "COMPANY_SETTINGS_SAVE_FAILED";
      error_message: string;
      field_errors?: Record<string, string>;
    };

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function toCompanySettingsDto(
  row: CompanySettingsRow
): CompanySettingsDto {
  return {
    company_name: row.company_name || DEFAULT_COMPANY_NAME,
    postal_code: row.postal_code,
    address: row.address,
    phone: row.phone,
    fax: row.fax,
    email: row.email,
    invoice_registration_number: row.invoice_registration_number,
    bank_name: row.bank_name,
    bank_branch: row.bank_branch,
    bank_account_type: row.bank_account_type,
    bank_account_number: row.bank_account_number,
    bank_account_holder: row.bank_account_holder,
  };
}

/**
 * 保存ボディを正規化。会社名必須、空文字は NULL。
 */
export function normalizeCompanySettingsSaveBody(
  body: CompanySettingsSaveBody
):
  | { ok: true; data: CompanySettingsDto }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors: Record<string, string>;
    } {
  const field_errors: Record<string, string> = {};

  if (typeof body.company_name !== "string" || !body.company_name.trim()) {
    field_errors.company_name = "会社名は必須です";
  }

  const optionalKeys = [
    "postal_code",
    "address",
    "phone",
    "fax",
    "email",
    "invoice_registration_number",
    "bank_name",
    "bank_branch",
    "bank_account_type",
    "bank_account_number",
    "bank_account_holder",
  ] as const;

  for (const key of optionalKeys) {
    const value = body[key];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      field_errors[key] = "入力形式が正しくありません";
    }
  }

  if (Object.keys(field_errors).length > 0) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
      field_errors,
    };
  }

  return {
    ok: true,
    data: {
      company_name: String(body.company_name).trim(),
      postal_code: optionalText(body.postal_code) ?? null,
      address: optionalText(body.address) ?? null,
      phone: optionalText(body.phone) ?? null,
      fax: optionalText(body.fax) ?? null,
      email: optionalText(body.email) ?? null,
      invoice_registration_number:
        optionalText(body.invoice_registration_number) ?? null,
      bank_name: optionalText(body.bank_name) ?? null,
      bank_branch: optionalText(body.bank_branch) ?? null,
      bank_account_type: optionalText(body.bank_account_type) ?? null,
      bank_account_number: optionalText(body.bank_account_number) ?? null,
      bank_account_holder: optionalText(body.bank_account_holder) ?? null,
    },
  };
}
