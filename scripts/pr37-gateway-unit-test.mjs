/**
 * PR37 gateway 単体テスト（秘密値・本番RPCなし）
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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

function sign(payloadB64, secret) {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}
function seal(session, secret) {
  const payloadB64 = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}
function unseal(token, secret, nowSec) {
  const [payloadB64, sig] = String(token || "").split(".");
  if (!payloadB64 || !sig) return null;
  const ab = Buffer.from(sig);
  const bb = Buffer.from(sign(payloadB64, secret));
  if (ab.length !== bb.length || !timingSafeEqual(ab, bb)) return null;
  const session = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  if (session.exp <= nowSec) return null;
  return session;
}
function derive(secret, sessionId, key) {
  if (!secret || secret.length < 32) throw new Error("CONFIG");
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

assert("cookie seal/unseal", unseal(token, secret, now)?.sid === "abc");
assert("cookie expired", unseal(seal({ ...session, exp: now - 1 }, secret), secret, now) === null);
assert("derive same", derive(secret, "s1", "11111111-1111-1111-1111-111111111111") === derive(secret, "s1", "11111111-1111-1111-1111-111111111111"));
assert("derive different session", derive(secret, "s1", "11111111-1111-1111-1111-111111111111") !== derive(secret, "s2", "11111111-1111-1111-1111-111111111111"));
let threw = false;
try {
  derive("short", "s", "11111111-1111-1111-1111-111111111111");
} catch {
  threw = true;
}
assert("14/15 short/missing secret fails", threw);

const authSrc = readFileSync(join(ROOT, "lib/gateway/authCookie.ts"), "utf8");
assert("no missing-secret fallback", !authSrc.includes('"missing-secret"'));
assert("max password 500", authSrc.includes("MAX_PASSWORD_LENGTH = 500"));

const originSrc = readFileSync(join(ROOT, "lib/gateway/origin.ts"), "utf8");
assert("origin exact match", originSrc.includes("origin !== expected"));
assert("origin no prefix allow", !originSrc.includes("startsWith(expected)"));

const csrfRoute = readFileSync(join(ROOT, "app/api/auth/csrf/route.ts"), "utf8");
assert("csrf no-store", csrfRoute.includes("no-store"));
assert("csrf returns token only", csrfRoute.includes("csrfToken") && !csrfRoute.includes("sid:"));

const logoutSrc = readFileSync(join(ROOT, "app/api/auth/logout/route.ts"), "utf8");
assert("logout requires csrf", logoutSrc.includes("assertCsrf"));
assert("logout requires origin", logoutSrc.includes("assertAppOrigin"));

const loginSrc = readFileSync(join(ROOT, "app/api/auth/login/route.ts"), "utf8");
assert("login password config 503", loginSrc.includes("isAppPasswordConfigured") && loginSrc.includes("CONFIG_ERROR"));
assert("login global fail bucket", loginSrc.includes("loginGlobalFailBucket"));

const rateSrc = readFileSync(join(ROOT, "lib/gateway/rateLimit.ts"), "utf8");
assert("login IP limit 10", rateSrc.includes("LOGIN_IP_LIMIT = 10"));
assert("login global fail 60", rateSrc.includes("LOGIN_GLOBAL_FAIL_LIMIT = 60"));
assert("reg limit 30", rateSrc.includes("REGISTRATION_LIMIT = 30"));

assert(
  "server-only admin",
  readFileSync(join(ROOT, "lib/supabase/serverAdmin.ts"), "utf8").includes('import "server-only"')
);

for (const f of ["app/login/page.tsx", "app/cases/new/page.tsx", "lib/supabase.ts"]) {
  assert(`no service role in ${f}`, !/SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(join(ROOT, f), "utf8")));
}

console.log(failed === 0 ? "\nALL_UNIT_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
