import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { StaffSession } from "@/lib/gateway/authCookie";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

export type StaffProfileRow = {
  id: string;
  display_name: string;
  is_active: boolean;
  is_admin: boolean;
};

export type AuthLoginSuccess = {
  userId: string;
  email: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
};

export type AuthLoginFailure = {
  error_code:
    | "UNAUTHORIZED"
    | "INACTIVE"
    | "PROFILE_MISSING"
    | "CONFIG_ERROR"
    | "AUTH_FAILED";
  error_message: string;
};

function getPublishableKey(): string | null {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return key && key.length > 0 ? key : null;
}

function getSupabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url && url.startsWith("http") ? url : null;
}

/** Auth 用（publishable）。service_role は使わない。 */
export function createAuthSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getPublishableKey();
  if (!url || !key) {
    throw new ServerAdminConfigError("Supabase Auth 設定が完了していません");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function loadStaffProfile(
  userId: string
): Promise<StaffProfileRow | null> {
  const admin = getServiceRoleSupabase();
  const withAdmin = await admin
    .from("staff_profiles")
    .select("id, display_name, is_active, is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (!withAdmin.error && withAdmin.data) {
    const row = withAdmin.data as {
      id: string;
      display_name: string;
      is_active: boolean;
      is_admin?: boolean | null;
    };
    return {
      id: row.id,
      display_name: row.display_name,
      is_active: row.is_active,
      is_admin: row.is_admin === true,
    };
  }

  // is_admin 未適用（column missing）でもログイン経路を落とさない
  const msg = (withAdmin.error?.message || "").toLowerCase();
  const missingAdminCol =
    msg.includes("is_admin") ||
    msg.includes("column") ||
    withAdmin.error?.code === "42703";
  if (!missingAdminCol) return null;

  const fallback = await admin
    .from("staff_profiles")
    .select("id, display_name, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (fallback.error || !fallback.data) return null;
  const row = fallback.data as {
    id: string;
    display_name: string;
    is_active: boolean;
  };
  return {
    id: row.id,
    display_name: row.display_name,
    is_active: row.is_active,
    is_admin: false,
  };
}

/**
 * email+password で Supabase Auth ログインし、active staff_profiles を確認する。
 */
export async function loginWithEmailPassword(input: {
  email: string;
  password: string;
}): Promise<
  { ok: true; value: AuthLoginSuccess } | { ok: false; error: AuthLoginFailure }
> {
  try {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      return {
        ok: false,
        error: {
          error_code: "UNAUTHORIZED",
          error_message: "メールアドレスまたはパスワードが正しくありません",
        },
      };
    }

    const client = createAuthSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: input.password,
    });

    if (error || !data.user || !data.session) {
      return {
        ok: false,
        error: {
          error_code: "UNAUTHORIZED",
          error_message: "メールアドレスまたはパスワードが正しくありません",
        },
      };
    }

    const profile = await loadStaffProfile(data.user.id);
    if (!profile) {
      // セッションを残さない
      await client.auth.signOut().catch(() => undefined);
      return {
        ok: false,
        error: {
          error_code: "PROFILE_MISSING",
          error_message:
            "社内ユーザー登録が完了していません。管理者に連絡してください",
        },
      };
    }
    if (!profile.is_active) {
      await client.auth.signOut().catch(() => undefined);
      return {
        ok: false,
        error: {
          error_code: "INACTIVE",
          error_message: "このアカウントは利用停止中です",
        },
      };
    }

    return {
      ok: true,
      value: {
        userId: data.user.id,
        email: data.user.email || email,
        displayName: profile.display_name,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      },
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        ok: false,
        error: {
          error_code: "CONFIG_ERROR",
          error_message: "サーバー設定が完了していません",
        },
      };
    }
    return {
      ok: false,
      error: {
        error_code: "AUTH_FAILED",
        error_message: "認証に失敗しました",
      },
    };
  }
}

/** 保存済み Supabase トークンを破棄（best-effort） */
export async function signOutSupabaseTokens(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
}): Promise<void> {
  if (!input.accessToken && !input.refreshToken) return;
  try {
    const client = createAuthSupabaseClient();
    if (input.accessToken && input.refreshToken) {
      await client.auth.setSession({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
      });
    }
    await client.auth.signOut();
  } catch {
    // best-effort
  }
}

/**
 * リクエスト時に inactive / profile 欠落を検出。
 * legacy_password セッションはスキップ（flag 経路）。
 */
export async function assertStaffSessionStillAllowed(
  session: StaffSession
): Promise<
  | {
      ok: true;
      displayName: string | null;
      email: string | null;
      isAdmin: boolean;
    }
  | { ok: false; error_code: "INACTIVE" | "PROFILE_MISSING" | "CONFIG_ERROR" }
> {
  if (session.authMode === "legacy_password" || !session.userId) {
    return {
      ok: true,
      displayName: session.displayName,
      email: session.email,
      isAdmin: false,
    };
  }
  try {
    const profile = await loadStaffProfile(session.userId);
    if (!profile) return { ok: false, error_code: "PROFILE_MISSING" };
    if (!profile.is_active) return { ok: false, error_code: "INACTIVE" };
    return {
      ok: true,
      displayName: profile.display_name,
      email: session.email,
      isAdmin: profile.is_admin,
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return { ok: false, error_code: "CONFIG_ERROR" };
    }
    return { ok: false, error_code: "CONFIG_ERROR" };
  }
}
