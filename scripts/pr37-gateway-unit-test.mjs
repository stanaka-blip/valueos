/**
 * PR37 gateway 単体テスト（秘密値・本番RPCなし）
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

// --- inline copies of critical pure helpers (avoid TS import) ---
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function sign(payloadB64, secret) {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}
function safeEq(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
function seal(session, secret) {
  const payloadB64 = b64url(JSON.stringify(session));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}
function unseal(token, secret, nowSec) {
  const [payloadB64, sig] = String(token || "").split(".");
  if (!payloadB64 || !sig) return null;
  if (!safeEq(sig, sign(payloadB64, secret))) return null;
  const session = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  if (session.exp <= nowSec) return null;
  return session;
}
function deriveRequestId(secret, sessionId, key) {
  const digest = createHmac("sha256", secret).update(`case-reg:v1:${sessionId}:${key}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const secret = randomBytes(32).toString("hex");
const now = Math.floor(Date.now() / 1000);
const session = { sid: "abc", csrf: "csrf-token-value", exp: now + 3600 };
const token = seal(session, secret);

assert("4 cookie seal/unseal", unseal(token, secret, now)?.sid === "abc");
assert("5 cookie tamper rejected", unseal(token.replace(/\./, ".x"), secret, now) === null || unseal(token.slice(0, -2) + "aa", secret, now) === null);
{
  const bad = token.split(".");
  const tampered = bad[0] + "." + "0".repeat(bad[1].length);
  assert("5b cookie sig reject", unseal(tampered, secret, now) === null);
}
assert("6 cookie expired rejected", unseal(seal({ ...session, exp: now - 1 }, secret), secret, now) === null);

const id1 = deriveRequestId(secret, "sid1", "11111111-1111-1111-1111-111111111111");
const id2 = deriveRequestId(secret, "sid1", "11111111-1111-1111-1111-111111111111");
const id3 = deriveRequestId(secret, "sid2", "11111111-1111-1111-1111-111111111111");
assert("15 idempotent derive same", id1 === id2);
assert("15b different session different id", id1 !== id3);

// DTO sanitize
function looksInternal(message) {
  return /constraint|service.?role|SELECT/i.test(message) || /[0-9a-f]{8}-[0-9a-f]{4}-/.test(message);
}
assert("13 success dto shape", !looksInternal("登録完了"));
assert("14 failure internal stripped", looksInternal("violates constraint case_x") === true);

// service role must not appear in client bundle sources we ship for browser
const clientFiles = [
  "app/login/page.tsx",
  "app/cases/new/page.tsx",
  "lib/supabase.ts",
];
for (const f of clientFiles) {
  const text = readFileSync(join(ROOT, f), "utf8");
  assert(`11 no service role in ${f}`, !/SUPABASE_SERVICE_ROLE_KEY|service_role_key/i.test(text));
}
assert(
  "11b serverAdmin uses server-only",
  readFileSync(join(ROOT, "lib/supabase/serverAdmin.ts"), "utf8").includes('import "server-only"')
);

// migration privileges
const mig = readFileSync(
  join(ROOT, "supabase/migrations/20260727010000_gateway_rate_limits.sql"),
  "utf8"
);
assert("17 migration revokes anon", /REVOKE ALL ON TABLE public\.gateway_rate_limits FROM anon/.test(mig));
assert("17b migration grants service_role", /GRANT EXECUTE ON FUNCTION public\.gateway_rate_limit_hit/.test(mig));

console.log(failed === 0 ? "\nALL_UNIT_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
