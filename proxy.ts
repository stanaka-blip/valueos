import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, unsealStaffSession } from "@/lib/gateway/authCookie";

/**
 * Next.js 16: middleware 約定は proxy。
 * 社内業務画面は原則すべて認証必須。販売店専用 Auth 実装までは /dealer/* も同じ社内ゲートで保護する。
 * API Route 内（とくに case-registrations）でも必ず再検証すること。
 */

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/api/auth/login") return true;
  return false;
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** open redirect 防止: パスのみ（query は付けない） */
function safeNextForLogin(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;
  if (pathname.startsWith("//")) return null;
  if (pathname.includes("://") || pathname.includes("\\")) return null;
  if (pathname === "/login" || pathname.startsWith("/login/")) return null;
  if (isApiPath(pathname)) return null;
  return pathname;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = unsealStaffSession(token);

  if (!session) {
    if (isApiPath(pathname)) {
      const isCaseReg =
        pathname === "/api/case-registrations" ||
        pathname.startsWith("/api/case-registrations/");
      if (isCaseReg) {
        return NextResponse.json(
          {
            ok: false,
            status: "FAILED",
            error_code: "UNAUTHORIZED",
            error_message: "認証が必要です",
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error_code: "UNAUTHORIZED",
          error_message: "認証が必要です",
        },
        { status: 401 }
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const next = safeNextForLogin(pathname);
    if (next) {
      loginUrl.searchParams.set("next", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 静的アセット・画像最適化・favicon 等は除外。
     * それ以外のページ / API にゲートを適用する。
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
