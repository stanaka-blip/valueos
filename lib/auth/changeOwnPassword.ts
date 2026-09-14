import "server-only";

import {
  createAuthSupabaseClient,
  loginWithEmailPassword,
} from "@/lib/auth/staffAuth";
import type { StaffSession } from "@/lib/gateway/authCookie";
import {
  type ChangePasswordResult,
  resolveChangePasswordSessionGate,
  validateChangePasswordInput,
} from "@/lib/auth/changePasswordValidation";

export type {
  ChangePasswordFailureCode,
  ChangePasswordResult,
} from "@/lib/auth/changePasswordValidation";

/**
 * ログイン中本人のパスワード変更（Supabase Auth）。
 * - 現在パスワードで再確認してから updateUser
 * - パスワード文字列は呼び出し側でログしないこと
 */
export async function changeOwnPassword(input: {
  session: StaffSession;
  currentPassword: string;
  password: string;
  confirm: string;
}): Promise<ChangePasswordResult> {
  const gate = resolveChangePasswordSessionGate(input.session);
  if (gate) return gate;

  const inputGate = validateChangePasswordInput({
    currentPassword: input.currentPassword,
    password: input.password,
    confirm: input.confirm,
  });
  if (inputGate) return inputGate;

  const verified = await loginWithEmailPassword({
    email: input.session.email!,
    password: input.currentPassword,
  });
  if (!verified.ok) {
    if (verified.error.error_code === "CONFIG_ERROR") {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: verified.error.error_message,
      };
    }
    return {
      ok: false,
      error_code: "CURRENT_PASSWORD_INVALID",
      error_message: "現在のパスワードが正しくありません",
    };
  }

  if (verified.value.userId !== input.session.userId) {
    return {
      ok: false,
      error_code: "UNAUTHORIZED",
      error_message: "認証が必要です",
    };
  }

  try {
    const client = createAuthSupabaseClient();
    const { error: sessionError } = await client.auth.setSession({
      access_token: verified.value.accessToken,
      refresh_token: verified.value.refreshToken,
    });
    if (sessionError) {
      return {
        ok: false,
        error_code: "UPDATE_FAILED",
        error_message: "パスワードを変更できませんでした",
      };
    }

    const { error: updateError } = await client.auth.updateUser({
      password: input.password,
    });
    await client.auth.signOut().catch(() => undefined);

    if (updateError) {
      return {
        ok: false,
        error_code: "UPDATE_FAILED",
        error_message: "パスワードを変更できませんでした",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error_code: "UPDATE_FAILED",
      error_message: "パスワードを変更できませんでした",
    };
  }
}
