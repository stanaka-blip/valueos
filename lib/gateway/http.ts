import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  CSRF_HEADER_NAME,
  type StaffSession,
  unsealStaffSession,
} from "@/lib/gateway/authCookie";

export const MAX_JSON_BODY_BYTES = 64 * 1024;

export function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export function requireJsonContentType(request: NextRequest): boolean {
  const ct = request.headers.get("content-type") || "";
  return ct.toLowerCase().includes("application/json");
}

export async function readJsonBodyLimited(
  request: NextRequest,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<{ ok: true; value: unknown } | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" }> {
  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > maxBytes) {
    return { ok: false, reason: "TOO_LARGE" };
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    return { ok: false, reason: "TOO_LARGE" };
  }

  try {
    const text = buf.toString("utf8");
    if (!text) return { ok: true, value: {} };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
}

export function getSessionFromRequest(request: NextRequest): StaffSession | null {
  return unsealStaffSession(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function assertCsrf(request: NextRequest, session: StaffSession): boolean {
  const header = request.headers.get(CSRF_HEADER_NAME) || "";
  if (!header || !session.csrf) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(session.csrf);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** open redirect 防止: 同一オリジンの社内パスのみ。/login・/api は拒否 */
export function safeNextPath(next: unknown): string {
  const fallback = "/";
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("://")) return fallback;
  if (next.includes("\\")) return fallback;
  const pathOnly = next.split("#")[0] || fallback;
  if (pathOnly === "/login" || pathOnly.startsWith("/login?") || pathOnly.startsWith("/login/")) {
    return fallback;
  }
  if (pathOnly === "/api" || pathOnly.startsWith("/api/") || pathOnly.startsWith("/api?")) {
    return fallback;
  }
  return pathOnly;
}
