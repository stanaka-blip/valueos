import type { CaseRegistrationDraftPayload } from "@/lib/caseRegistrationDrafts/draftPayload";
import { safeUserErrorMessage } from "./validation";

export type DraftListItem = {
  id: string;
  current_step: number;
  customer_name_preview: string | null;
  created_at: string;
  updated_at: string;
};

async function fetchCsrfToken(): Promise<
  { ok: true; token: string } | { ok: false; error_message: string }
> {
  const csrfRes = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
  });
  const csrfData = (await csrfRes.json().catch(() => ({}))) as {
    csrfToken?: string;
    error_code?: string;
    error_message?: string;
  };
  if (!csrfRes.ok || !csrfData.csrfToken) {
    return {
      ok: false,
      error_message: safeUserErrorMessage(
        csrfData.error_code,
        csrfData.error_message || "認証が必要です"
      ),
    };
  }
  return { ok: true, token: csrfData.csrfToken };
}

export async function fetchCaseRegistrationDrafts(): Promise<{
  ok: boolean;
  drafts: DraftListItem[];
  error_message?: string;
}> {
  const res = await fetch("/api/case-registration-drafts", {
    method: "GET",
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    drafts?: DraftListItem[];
    error_message?: string;
  } | null;
  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      drafts: [],
      error_message: json?.error_message || "下書き一覧を取得できませんでした",
    };
  }
  return { ok: true, drafts: json.drafts || [] };
}

export async function fetchCaseRegistrationDraft(id: string): Promise<{
  ok: boolean;
  payload?: CaseRegistrationDraftPayload;
  draftId?: string;
  error_message?: string;
}> {
  const res = await fetch(
    `/api/case-registration-drafts?id=${encodeURIComponent(id)}`,
    { method: "GET", credentials: "same-origin" }
  );
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    draft?: { id: string; payload: CaseRegistrationDraftPayload };
    error_message?: string;
  } | null;
  if (!res.ok || !json?.ok || !json.draft) {
    return {
      ok: false,
      error_message: json?.error_message || "下書きを開けませんでした",
    };
  }
  return {
    ok: true,
    draftId: json.draft.id,
    payload: json.draft.payload,
  };
}

export async function saveCaseRegistrationDraft(options: {
  draftId: string | null;
  payload: CaseRegistrationDraftPayload;
}): Promise<{
  ok: boolean;
  draftId?: string;
  error_message?: string;
}> {
  const csrf = await fetchCsrfToken();
  if (!csrf.ok) return { ok: false, error_message: csrf.error_message };

  const res = await fetch("/api/case-registration-drafts", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf.token,
    },
    body: JSON.stringify({
      draft_id: options.draftId,
      payload: options.payload,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    draft?: { id: string };
    error_message?: string;
  } | null;
  if (!res.ok || !json?.ok || !json.draft?.id) {
    return {
      ok: false,
      error_message: json?.error_message || "下書きを保存できませんでした",
    };
  }
  return { ok: true, draftId: json.draft.id };
}

export async function deleteCaseRegistrationDraft(id: string): Promise<{
  ok: boolean;
  error_message?: string;
}> {
  const csrf = await fetchCsrfToken();
  if (!csrf.ok) return { ok: false, error_message: csrf.error_message };

  const res = await fetch(
    `/api/case-registration-drafts?id=${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "X-CSRF-Token": csrf.token,
      },
    }
  );
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error_message?: string;
  } | null;
  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      error_message: json?.error_message || "下書きを削除できませんでした",
    };
  }
  return { ok: true };
}
