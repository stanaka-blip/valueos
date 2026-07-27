import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/gateway/authCookie";

export const runtime = "nodejs";

/**
 * 暫定社内ログアウト。cookie を破棄する。
 */
export async function POST(_request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    ...authCookieOptions(),
    maxAge: 0,
  });
  return res;
}
