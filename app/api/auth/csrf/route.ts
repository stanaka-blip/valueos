import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/gateway/http";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * CSRF 再取得。HttpOnly session を検証し token のみ返す。
 * PR3 は画面ロード時または POST 直前にここから取得する（sessionStorage のみに依存しない）。
 */
export async function GET(request: NextRequest) {
  const started = Date.now();
  const session = getSessionFromRequest(request);

  if (!session) {
    gatewayLog({
      route: "auth/csrf",
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      { ok: false, error_code: "UNAUTHORIZED", error_message: "認証が必要です" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  gatewayLog({
    route: "auth/csrf",
    duration_ms: Date.now() - started,
    ok: true,
  });

  return NextResponse.json(
    { csrfToken: session.csrf },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
