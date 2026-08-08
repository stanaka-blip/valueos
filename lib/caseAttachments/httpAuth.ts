import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  assertCsrf,
  getSessionFromRequest,
  readJsonBodyLimited,
  requireJsonContentType,
} from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import { gatewayLog } from "@/lib/gateway/safeDto";
import type { StaffSession } from "@/lib/gateway/authCookie";
import { toSafeAttachmentError } from "./safeDto";

export type AuthedJsonContext =
  | {
      ok: true;
      session: StaffSession;
      body: unknown;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * mutating case-attachments API 共通:
 * Origin → session → CSRF → JSON Content-Type → body
 */
export async function requireStaffJsonMutation(
  request: NextRequest,
  route: string
): Promise<AuthedJsonContext> {
  const started = Date.now();

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route,
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return {
      ok: false,
      response: NextResponse.json(
        toSafeAttachmentError({
          error_code: err.body.error_code,
          error_message: err.body.error_message || "不正なリクエストです",
        }),
        { status: err.status }
      ),
    };
  }

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
        toSafeAttachmentError({
          error_code: "UNAUTHORIZED",
          error_message: "認証が必要です",
        }),
        { status: 401 }
      ),
    };
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route,
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return {
      ok: false,
      response: NextResponse.json(
        toSafeAttachmentError({
          error_code: "FORBIDDEN",
          error_message: "不正なリクエストです",
        }),
        { status: 403 }
      ),
    };
  }

  if (!requireJsonContentType(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        toSafeAttachmentError({
          error_code: "BAD_REQUEST",
          error_message: "不正なリクエストです",
        }),
        { status: 415 }
      ),
    };
  }

  const bodyResult = await readJsonBodyLimited(request);
  if (!bodyResult.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        toSafeAttachmentError({
          error_code: "BAD_REQUEST",
          error_message:
            bodyResult.reason === "TOO_LARGE"
              ? "リクエストが大きすぎます"
              : "不正なリクエストです",
        }),
        { status: bodyResult.reason === "TOO_LARGE" ? 413 : 400 }
      ),
    };
  }

  return { ok: true, session, body: bodyResult.value };
}

export async function requireStaffSessionGet(
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
        toSafeAttachmentError({
          error_code: "UNAUTHORIZED",
          error_message: "認証が必要です",
        }),
        { status: 401 }
      ),
    };
  }
  return { ok: true, session };
}

export function statusForAttachmentError(errorCode: string): number {
  switch (errorCode) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
    case "ATTACHMENT_INACTIVE":
      return 403;
    case "CASE_NOT_FOUND":
    case "INTENT_NOT_FOUND":
    case "ATTACHMENT_NOT_FOUND":
    case "OBJECT_NOT_FOUND":
      return 404;
    case "CONFIG_ERROR":
      return 503;
    case "FILE_TOO_LARGE":
    case "CASE_ATTACHMENT_COUNT_LIMIT":
    case "CASE_ATTACHMENT_SIZE_LIMIT":
      return 413;
    default:
      return 400;
  }
}
