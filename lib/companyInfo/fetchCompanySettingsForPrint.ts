/**
 * 帳票クライアントから Server Action 経由で会社情報を取得する。
 * anon / service_role 直読みは使わない。
 */

import { fetchCompanySettingsForPrintAction } from "./fetchCompanySettingsForPrintAction";
import type { FetchCompanySettingsForPrintResult } from "./fetchCompanySettingsForPrintAction";

export type { FetchCompanySettingsForPrintResult };

export async function fetchCompanySettingsForPrint(): Promise<FetchCompanySettingsForPrintResult> {
  try {
    return await fetchCompanySettingsForPrintAction();
  } catch {
    return {
      ok: false,
      error_code: "COMPANY_SETTINGS_READ_FAILED",
      error_message: "会社情報の取得に失敗しました",
    };
  }
}
