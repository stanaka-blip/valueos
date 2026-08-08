import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { assertStaffSessionStillAllowed } from "@/lib/auth/staffAuth";
import type { StaffSession } from "@/lib/gateway/authCookie";
import {
  assertCsrf,
  getSessionFromRequest,
  readJsonBodyLimited,
  requireJsonContentType,
} from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import { gatewayLog } from "@/lib/gateway/safeDto";

export type StaffAdminAuthed =
  | {
      ok: true;
      session: StaffSession;
      body: unknown;
      isAdmin: true;
    }
  | { ok: false; response: NextResponse };

function staffError(code: string, message: string) {
  return { ok: false as const, error_code: code, error_message: message };
}

export function statusForStaffError(code: string): number {
  switch (code) {
    case "UNAUTHORIZED":
    case "PROFILE_MISSING":
      return 401;
    case "FORBIDDEN":
    case "INACTIVE":
    case "NOT_ADMIN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFIG_ERROR":
      return 503;
    default:
      return 400;
  }
}

async function requireActiveAdminSession(
  request: NextRequest,
  route: string
): Promise<
  | { ok: true; session: StaffSession }
  | { ok: false; response: NextResponse }
> {
  const started = Date.now();
  const session = getSessionFromRequest(request);
  if (!session) {
    gatewayLog({
      route,
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return {
      ok: false,
      response: NextResponse.json(
        staffError("UNAUTHORIZED", "認証が必要です"),
        { status: 401 }
      ),
    };
  }

  const allowed = await assertStaffSessionStillAllowed(session);
  if (!allowed.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        staffError(
          allowed.error_code,
          allowed.error_code === "INACTIVE"
            ? "このアカウントは利用停止中です"
            : "認証が必要です"
        ),
        {
          status: statusForStaffError(allowed.error_code),
        }
      ),
    };
  }

  if (!allowed.isAdmin) {
    gatewayLog({
      route,
      error_code: "NOT_ADMIN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return {
      ok: false,
      response: NextResponse.json(
        staffError("NOT_ADMIN", "管理者のみ利用できます"),
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}

/** GET /api/staff — 管理者のみ */
export async function requireStaffAdminGet(
  request: NextRequest,
  route: string
) {
  return requireActiveAdminSession(request, route);
}

/** mutating /api/staff/* — Origin + CSRF + 管理者 */
export async function requireStaffAdminMutation(
  request: NextRequest,
  route: string
): Promise<StaffAdminAuthed> {
  const started = Date.now();
  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const oerr = originErrorResponse(originResult);
    gatewayLog({
      route,
      error_code: oerr.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return {
      ok: false,
      response: NextResponse.json(oerr.body, { status: oerr.status }),
    };
  }

  const authed = await requireActiveAdminSession(request, route);
  if (!authed.ok) return authed;

  if (!assertCsrf(request, authed.session)) {
    return {
      ok: false,
      response: NextResponse.json(
        staffError("FORBIDDEN", "不正なリクエストです"),
        { status: 403 }
      ),
    };
  }

  if (!requireJsonContentType(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        staffError("BAD_REQUEST", "不正なリクエストです"),
        { status: 415 }
      ),
    };
  }

  const bodyResult = await readJsonBodyLimited(request);
  if (!bodyResult.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        staffError(
          "BAD_REQUEST",
          bodyResult.reason === "TOO_LARGE"
            ? "リクエストが大きすぎます"
            : "不正なリクエストです"
        ),
        { status: bodyResult.reason === "TOO_LARGE" ? 413 : 400 }
      ),
    };
  }

  return {
    ok: true,
    session: authed.session,
    body: bodyResult.value,
    isAdmin: true,
  };
}
