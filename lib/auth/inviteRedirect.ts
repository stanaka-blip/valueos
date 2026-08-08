/**
 * 招待 / recovery メールの redirectTo 先。
 * INTERNAL_APP_ORIGIN（Production 例: https://valueos-rose.vercel.app）配下。
 */
export const STAFF_SET_PASSWORD_PATH = "/auth/set-password";

/** 招待 API 等で使う絶対 URL。未設定時は null（Supabase 側 Site URL にフォールバック）。 */
export function getStaffInviteRedirectTo(
  origin: string | undefined = process.env.INTERNAL_APP_ORIGIN
): string | null {
  if (!origin || typeof origin !== "string") return null;
  const base = origin.trim().replace(/\/$/, "");
  if (!base.startsWith("http://") && !base.startsWith("https://")) return null;
  return `${base}${STAFF_SET_PASSWORD_PATH}`;
}
