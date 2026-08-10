/**
 * ValueOS 社内 gateway 用の署名付き cookie。
 * Supabase Auth で本人確認したあと、CSRF / Origin 防衛のため本 cookie を発行する。
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "vos_staff_session";
export const CSRF_HEADER_NAME = "x-csrf-token";
/** Supabase Auth access/refresh（httpOnly）。service_role ではない。 */
export const SB_ACCESS_COOKIE_NAME = "vos_sb_access_token";
export const SB_REFRESH_COOKIE_NAME = "vos_sb_refresh_token";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const MAX_PASSWORD_LENGTH = 500;
export const MAX_EMAIL_LENGTH = 320;

export type StaffAuthMode = "supabase" | "legacy_password";

export type StaffSession = {
  /** 冪等・レート制限用。Auth ログイン時は userId と同値。legacy はランダム。 */
  sid: string;
  csrf: string;
  exp: number;
  /** Supabase Auth user id（uuid）。legacy は null */
  userId: string | null;
  email: string | null;
  displayName: string | null;
  authMode: StaffAuthMode;
};

export class AuthConfigError extends Error {
  constructor() {
    super("AUTH_CONFIG_ERROR");
    this.name = "AuthConfigError";
  }
}

function getAuthSecret(): string | null {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

export function isAuthSecretConfigured(): boolean {
  return getAuthSecret() !== null;
}

export function isAppPasswordConfigured(): boolean {
  const expected = process.env.INTERNAL_APP_PASSWORD;
  return typeof expected === "string" && expected.length > 0;
}

/** 共有パスワード緊急経路。明示 flag があるときのみ。 */
export function isLegacyStaffPasswordAllowed(): boolean {
  return process.env.ALLOW_LEGACY_STAFF_PASSWORD === "true";
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
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function verifyStaffPassword(password: string): boolean {
  const expected = process.env.INTERNAL_APP_PASSWORD;
  if (!expected || !password) return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  return safeEqualStr(password, expected);
}

/** 冪等キー派生・レート制限に使う安定 actor id */
export function sessionActorKey(session: StaffSession): string {
  if (session.userId && isUuid(session.userId)) return session.userId;
  return session.sid;
}

export function createStaffSession(input?: {
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
  authMode?: StaffAuthMode;
}): StaffSession | null {
  if (!getAuthSecret()) return null;
  const authMode = input?.authMode ?? "legacy_password";
  const userId =
    typeof input?.userId === "string" && isUuid(input.userId)
      ? input.userId
      : null;
  const sid =
    authMode === "supabase" && userId
      ? userId
      : randomBytes(16).toString("hex");
  return {
    sid,
    csrf: randomBytes(32).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    userId,
    email: typeof input?.email === "string" ? input.email : null,
    displayName:
      typeof input?.displayName === "string" ? input.displayName : null,
    authMode,
  };
}

export function sealStaffSession(session: StaffSession): string | null {
  const secret = getAuthSecret();
  if (!secret) return null;
  const payloadB64 = b64urlEncode(JSON.stringify(session));
  const sig = signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function unsealStaffSession(
  token: string | undefined | null
): StaffSession | null {
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
    typeof (parsed as { sid?: unknown }).sid !== "string" ||
    typeof (parsed as { csrf?: unknown }).csrf !== "string" ||
    typeof (parsed as { exp?: unknown }).exp !== "number"
  ) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.sid || !obj.csrf) return null;
  if ((obj.exp as number) <= Math.floor(Date.now() / 1000)) return null;

  const userId =
    typeof obj.userId === "string" && isUuid(obj.userId) ? obj.userId : null;
  const email = typeof obj.email === "string" ? obj.email : null;
  const displayName =
    typeof obj.displayName === "string" ? obj.displayName : null;
  const authMode: StaffAuthMode =
    obj.authMode === "supabase" || obj.authMode === "legacy_password"
      ? obj.authMode
      : userId
        ? "supabase"
        : "legacy_password";

  return {
    sid: obj.sid as string,
    csrf: obj.csrf as string,
    exp: obj.exp as number,
    userId,
    email,
    displayName,
    authMode,
  };
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

function deriveNamespacedRequestId(
  namespace: string,
  sessionId: string,
  idempotencyKey: string
): string {
  const secret = getAuthSecret();
  if (!secret) {
    throw new AuthConfigError();
  }
  const digest = createHmac("sha256", secret)
    .update(`${namespace}:${sessionId}:${idempotencyKey}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * v2: actor を userId（なければ sid）に変更したため namespace を bump。
 * v1 との request_id 衝突を避ける。
 */
export function deriveRequestId(sessionId: string, idempotencyKey: string): string {
  return deriveNamespacedRequestId("case-reg:v2", sessionId, idempotencyKey);
}

export function deriveCaseLineAppendRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "case-line-append:v2",
    sessionId,
    idempotencyKey
  );
}

export function derivePurchaseOrderCreateRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "purchase-order-create:v2",
    sessionId,
    idempotencyKey
  );
}

export function deriveProductSetupRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "product-setup:v2",
    sessionId,
    idempotencyKey
  );
}

export function deriveExistingProductPriceSetupRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "existing-product-price-setup:v2",
    sessionId,
    idempotencyKey
  );
}

export function deriveSupplierPurchasePriceBulkRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "supplier-purchase-price-bulk:v2",
    sessionId,
    idempotencyKey
  );
}

export function deriveDealerSalesPriceBulkRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "dealer-sales-price-bulk:v2",
    sessionId,
    idempotencyKey
  );
}

export function derivePackageBulkSetupRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "package-bulk-setup:v2",
    sessionId,
    idempotencyKey
  );
}

export function deriveThreePartyMoneyRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "three-party-money:v1",
    sessionId,
    idempotencyKey
  );
}

export function deriveProductBulkSetupRequestId(
  sessionId: string,
  idempotencyKey: string
): string {
  return deriveNamespacedRequestId(
    "product-bulk-setup:v2",
    sessionId,
    idempotencyKey
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
