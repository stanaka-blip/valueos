/**
 * パスワード変更の純粋バリデーション（server-only なし・テスト可）。
 */
import { validateNewPassword } from "@/lib/auth/inviteSession";
import type { StaffSession } from "@/lib/gateway/authCookie";
import { MAX_PASSWORD_LENGTH } from "@/lib/gateway/authCookie";

export type ChangePasswordFailureCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "LEGACY_UNSUPPORTED"
  | "CURRENT_PASSWORD_INVALID"
  | "UPDATE_FAILED"
  | "CONFIG_ERROR";

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error_code: ChangePasswordFailureCode;
      error_message: string;
    };

/** セッションが本人パスワード変更可能か */
export function resolveChangePasswordSessionGate(
  session: StaffSession
): ChangePasswordResult | null {
  if (
    session.authMode !== "supabase" ||
    !session.userId ||
    !session.email
  ) {
    return {
      ok: false,
      error_code: "LEGACY_UNSUPPORTED",
      error_message:
        "このログイン方式ではパスワード変更できません。管理者に連絡してください",
    };
  }
  return null;
}

export function validateChangePasswordInput(input: {
  currentPassword: string;
  password: string;
  confirm: string;
}): ChangePasswordResult | null {
  if (
    !input.currentPassword ||
    input.currentPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return {
      ok: false,
      error_code: "VALIDATION",
      error_message: "現在のパスワードを入力してください",
    };
  }
  const validation = validateNewPassword({
    password: input.password,
    confirm: input.confirm,
  });
  if (validation) {
    return {
      ok: false,
      error_code: "VALIDATION",
      error_message: validation,
    };
  }
  return null;
}
