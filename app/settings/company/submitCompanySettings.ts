/**
 * 会社情報設定クライアント。
 * GET: staff cookie のみ。PUT: CSRF 取得後に Origin/CSRF 付きで送信。
 * Origin ヘッダーはブラウザに任せ、手動設定しない。
 */

import type { CompanySettingsDto } from "@/lib/companyInfo/companySettingsDto";

export type FetchCompanySettingsResult =
  | { ok: true; data: CompanySettingsDto; source?: "db" | "fallback" }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
    };

export type SubmitCompanySettingsResult =
  | { ok: true; data: CompanySettingsDto }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

async function fetchCsrfToken(): Promise<
  { ok: true; csrfToken: string } | { ok: false; error_message: string }
> {
  const csrfRes = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const csrfData = (await csrfRes.json().catch(() => ({}))) as {
    csrfToken?: string;
    error_message?: string;
  };
  if (!csrfRes.ok || !csrfData.csrfToken) {
    return {
      ok: false,
      error_message: csrfData.error_message || "認証が必要です",
    };
  }
  return { ok: true, csrfToken: csrfData.csrfToken };
}

export async function fetchCompanySettings(): Promise<FetchCompanySettingsResult> {
  const res = await fetch("/api/settings/company", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: CompanySettingsDto;
    source?: "db" | "fallback";
    error_code?: string;
    error_message?: string;
  };

  if (res.ok && data.ok && data.data) {
    return { ok: true, data: data.data, source: data.source };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: data.error_message || "会社情報の取得に失敗しました",
  };
}

export async function submitCompanySettings(
  body: CompanySettingsDto
): Promise<SubmitCompanySettingsResult> {
  const csrf = await fetchCsrfToken();
  if (!csrf.ok) {
    return { ok: false, error_message: csrf.error_message };
  }

  const res = await fetch("/api/settings/company", {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf.csrfToken,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: CompanySettingsDto;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (res.ok && data.ok && data.data) {
    return { ok: true, data: data.data };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: data.error_message || "会社情報を保存できませんでした",
    field_errors: data.field_errors,
  };
}
