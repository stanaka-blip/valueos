"use server";

import { cookies } from "next/headers";

import {
  toCompanySettingsDto,
  type CompanySettingsDto,
} from "@/lib/companyInfo/companySettingsDto";
import { getCompanySettingsAdmin } from "@/lib/companyInfo/getCompanySettingsAdmin";
import {
  AUTH_COOKIE_NAME,
  unsealStaffSession,
} from "@/lib/gateway/authCookie";

export type FetchCompanySettingsForPrintResult =
  | {
      ok: true;
      data: CompanySettingsDto;
      source: "db" | "fallback";
    }
  | {
      ok: false;
      error_code:
        | "UNAUTHORIZED"
        | "CONFIG_ERROR"
        | "COMPANY_SETTINGS_READ_FAILED";
      error_message: string;
    };

/**
 * 帳票向け: 認証済みスタッフのみ、admin 読取で会社情報を返す。
 * service_role クライアントはサーバー内のみ。
 */
export async function fetchCompanySettingsForPrintAction(): Promise<FetchCompanySettingsForPrintResult> {
  const cookieStore = await cookies();
  const session = unsealStaffSession(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );
  if (!session) {
    return {
      ok: false,
      error_code: "UNAUTHORIZED",
      error_message: "認証が必要です",
    };
  }

  const loaded = await getCompanySettingsAdmin();
  if (!loaded.ok) {
    return {
      ok: false,
      error_code: loaded.error_code,
      error_message: loaded.error_message,
    };
  }

  return {
    ok: true,
    data: toCompanySettingsDto(loaded.data),
    source: loaded.source,
  };
}
