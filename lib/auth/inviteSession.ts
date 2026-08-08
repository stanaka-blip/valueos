import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

export const INVITE_LINK_EXPIRED_MESSAGE =
  "招待リンクの有効期限が切れています";

export const MIN_INVITE_PASSWORD_LENGTH = 8;

export type AuthCallbackParse =
  | {
      kind: "error";
      error: string | null;
      errorCode: string | null;
      errorDescription: string | null;
    }
  | {
      kind: "tokens";
      accessToken: string;
      refreshToken: string;
      type: string | null;
    }
  | {
      kind: "otp";
      tokenHash: string;
      type: EmailOtpType;
    }
  | {
      kind: "code";
      code: string;
    }
  | { kind: "none" };

function firstParam(
  search: URLSearchParams,
  hash: URLSearchParams,
  key: string
): string | null {
  return search.get(key) || hash.get(key);
}

/**
 * Supabase invite / recovery のリダイレクト URL（query / hash）を解釈する。
 * - implicit: #access_token&refresh_token&type=invite|recovery
 * - token_hash: ?token_hash&type=
 * - PKCE: ?code=
 * - 期限切れ等: ?error= / #error=
 */
export function parseAuthCallbackParams(
  search: string,
  hash: string
): AuthCallbackParse {
  const searchParams = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const hashParams = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );

  const error =
    firstParam(searchParams, hashParams, "error") ||
    firstParam(searchParams, hashParams, "error_code");
  const errorCode = firstParam(searchParams, hashParams, "error_code");
  const errorDescription = firstParam(
    searchParams,
    hashParams,
    "error_description"
  );
  if (error || errorDescription) {
    return {
      kind: "error",
      error,
      errorCode,
      errorDescription,
    };
  }

  const accessToken = firstParam(searchParams, hashParams, "access_token");
  const refreshToken = firstParam(searchParams, hashParams, "refresh_token");
  if (accessToken && refreshToken) {
    return {
      kind: "tokens",
      accessToken,
      refreshToken,
      type: firstParam(searchParams, hashParams, "type"),
    };
  }

  const tokenHash = firstParam(searchParams, hashParams, "token_hash");
  const otpType = firstParam(searchParams, hashParams, "type");
  if (tokenHash && otpType) {
    return {
      kind: "otp",
      tokenHash,
      type: otpType as EmailOtpType,
    };
  }

  const code = firstParam(searchParams, hashParams, "code");
  if (code) {
    return { kind: "code", code };
  }

  return { kind: "none" };
}

export function isInviteOrRecoveryType(type: string | null | undefined): boolean {
  if (!type) return true;
  return type === "invite" || type === "recovery";
}

export function validateNewPassword(input: {
  password: string;
  confirm: string;
}): string | null {
  if (!input.password || input.password.length < MIN_INVITE_PASSWORD_LENGTH) {
    return `パスワードは${MIN_INVITE_PASSWORD_LENGTH}文字以上で入力してください`;
  }
  if (input.password.length > 500) {
    return "パスワードが長すぎます";
  }
  if (input.password !== input.confirm) {
    return "パスワード確認が一致しません";
  }
  return null;
}

export async function establishSessionFromAuthCallback(
  client: SupabaseClient,
  search: string,
  hash: string
): Promise<
  | { ok: true; email: string | null; type: string | null }
  | { ok: false; message: string }
> {
  const parsed = parseAuthCallbackParams(search, hash);

  if (parsed.kind === "error" || parsed.kind === "none") {
    return { ok: false, message: INVITE_LINK_EXPIRED_MESSAGE };
  }

  if (parsed.kind === "tokens") {
    if (!isInviteOrRecoveryType(parsed.type)) {
      return { ok: false, message: INVITE_LINK_EXPIRED_MESSAGE };
    }
    const { data, error } = await client.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    if (error || !data.session) {
      return { ok: false, message: INVITE_LINK_EXPIRED_MESSAGE };
    }
    return {
      ok: true,
      email: data.user?.email ?? data.session.user?.email ?? null,
      type: parsed.type,
    };
  }

  if (parsed.kind === "otp") {
    if (!isInviteOrRecoveryType(parsed.type)) {
      return { ok: false, message: INVITE_LINK_EXPIRED_MESSAGE };
    }
    const { data, error } = await client.auth.verifyOtp({
      token_hash: parsed.tokenHash,
      type: parsed.type,
    });
    if (error || !data.session) {
      return { ok: false, message: INVITE_LINK_EXPIRED_MESSAGE };
    }
    return {
      ok: true,
      email: data.user?.email ?? data.session.user?.email ?? null,
      type: parsed.type,
    };
  }

  // PKCE code（email リンク由来では code_verifier が無いことが多く、失敗時は期限切れ表示）
  const { data, error } = await client.auth.exchangeCodeForSession(parsed.code);
  if (error || !data.session) {
    return { ok: false, message: INVITE_LINK_EXPIRED_MESSAGE };
  }
  return {
    ok: true,
    email: data.user?.email ?? data.session.user?.email ?? null,
    type: null,
  };
}
