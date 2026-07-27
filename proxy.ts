import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, unsealStaffSession } from "@/lib/gateway/authCookie";

/**
 * Next.js 16 では middleware 約定が proxy に改名されている。
 * ここは防御の一層に過ぎない。API Route 内でも必ず再検証すること。
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isCasesNew = pathname === "/cases/new" || pathname.startsWith("/cases/new/");
  const isCaseRegApi =
    pathname === "/api/case-registrations" ||
    pathname.startsWith("/api/case-registrations/");

  if (!isCasesNew && !isCaseRegApi) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = unsealStaffSession(token);

  if (!session) {
    if (isCaseRegApi) {
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

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // open redirect 防止: 固定パスのみ
    loginUrl.search = "";
    loginUrl.searchParams.set("next", "/cases/new");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cases/new", "/cases/new/:path*", "/api/case-registrations", "/api/case-registrations/:path*"],
};
