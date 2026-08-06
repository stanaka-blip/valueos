import type { CompanySettingsDto } from "@/lib/companyInfo/companySettingsDto";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyInfo/types";

export type PrintCompanyInfo = CompanySettingsDto;

export function companyDisplayName(company: PrintCompanyInfo): string {
  const name = (company.company_name || "").trim();
  return name || DEFAULT_COMPANY_NAME;
}

/** 郵便番号と住所を1行にまとめる。どちらも無ければ null */
export function formatPostalAddress(
  postalCode: string | null | undefined,
  address: string | null | undefined
): string | null {
  const postal = (postalCode || "").trim();
  const addr = (address || "").trim();
  if (!postal && !addr) return null;
  if (postal && addr) return `〒${postal} ${addr}`;
  if (postal) return `〒${postal}`;
  return addr;
}

export function hasBankTransferInfo(company: PrintCompanyInfo): boolean {
  return Boolean(
    (company.bank_name || "").trim() ||
      (company.bank_branch || "").trim() ||
      (company.bank_account_type || "").trim() ||
      (company.bank_account_number || "").trim() ||
      (company.bank_account_holder || "").trim()
  );
}

export function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}
