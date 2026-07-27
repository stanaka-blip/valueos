/**
 * 暫定社内ゲート用の署名付き cookie。
 * Supabase Auth の代替として恒久化しないこと。将来は本格 Auth へ置換する。
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "vos_staff_session";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type StaffSession = {
  sid: string;
  csrf: string;
  exp: number;
};

function getAuthSecret(): string | null {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8");
  return b.toString("base64url");
}

function b64urlDecode(s: string): Buffer | null {
  try {
    return Buffer.from(s, "base64url");
  } catch {
    return null;
  }
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // 長さ差でも定数時間に近づけるためダミー比較
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function verifyStaffPassword(password: string): boolean {
  const expected = process.env.INTERNAL_APP_PASSWORD;
  if (!expected || !password) return false;
  return safeEqualStr(password, expected);
}

export function createStaffSession(): StaffSession | null {
  if (!getAuthSecret()) return null;
  return {
    sid: randomBytes(16).toString("hex"),
    csrf: randomBytes(32).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
}

export function sealStaffSession(session: StaffSession): string | null {
  const secret = getAuthSecret();
  if (!secret) return null;
  const payloadB64 = b64urlEncode(JSON.stringify(session));
  const sig = signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function unsealStaffSession(token: string | undefined | null): StaffSession | null {
  if (!token) return null;
  const secret = getAuthSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = signPayload(payloadB64, secret);
  if (!safeEqualStr(sig, expected)) return null;

  const raw = b64urlDecode(payloadB64);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as StaffSession).sid !== "string" ||
    typeof (parsed as StaffSession).csrf !== "string" ||
    typeof (parsed as StaffSession).exp !== "number"
  ) {
    return null;
  }

  const session = parsed as StaffSession;
  if (!session.sid || !session.csrf) return null;
  if (session.exp <= Math.floor(Date.now() / 1000)) return null;
  return session;
}

export function authCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** サーバー派生 request_id。クライアントの request_id は信用しない。 */
export function deriveRequestId(sessionId: string, idempotencyKey: string): string {
  const secret = getAuthSecret() || "missing-secret";
  const digest = createHmac("sha256", secret)
    .update(`case-reg:v1:${sessionId}:${idempotencyKey}`)
    .digest();
  // UUID v4 形式に整形（バージョン/バリアントビットを固定）
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
