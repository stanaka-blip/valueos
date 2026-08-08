/**
 * 社内 Supabase Auth 基盤の契約テスト（本番書込なし）
 * 実行: node scripts/pr-staff-supabase-auth-contract-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const migration = read(
  "supabase/migrations/20260808220000_staff_profiles_and_attachment_actors.sql"
);
const authCookie = read("lib/gateway/authCookie.ts");
const staffAuth = read("lib/auth/staffAuth.ts");
const login = read("app/api/auth/login/route.ts");
const logout = read("app/api/auth/logout/route.ts");
const me = read("app/api/auth/me/route.ts");
const loginPage = read("app/login/page.tsx");
const sidebar = read("app/components/AppSidebar.tsx");
const proxy = read("proxy.ts");
const docs = read("docs/staff-supabase-auth.md");
const attachCore = read("lib/caseAttachments/caseAttachmentsCore.ts");
const caseReg = read("app/api/case-registrations/route.ts");

assert(
  "staff_profiles table additive",
  migration.includes("CREATE TABLE IF NOT EXISTS public.staff_profiles") &&
    migration.includes("REFERENCES auth.users (id)") &&
    !migration.includes("DROP TABLE") &&
    !/UPDATE\s+public\./i.test(migration)
);
assert(
  "email not stored on staff_profiles",
  !/email\s+text/i.test(migration.split("staff_profiles")[1]?.slice(0, 500) || "")
);
assert(
  "attachment user_id columns additive",
  migration.includes("uploaded_by_user_id") &&
    migration.includes("deleted_by_user_id") &&
    migration.includes("ADD COLUMN IF NOT EXISTS")
);

assert(
  "StaffSession has userId email displayName csrf exp",
  authCookie.includes("userId: string | null") &&
    authCookie.includes("email: string | null") &&
    authCookie.includes("displayName: string | null") &&
    authCookie.includes("csrf: string") &&
    authCookie.includes("exp: number")
);
assert(
  "idempotency namespaces bumped to v2",
  authCookie.includes("case-reg:v2") &&
    authCookie.includes("case-line-append:v2") &&
    authCookie.includes("product-setup:v2")
);
assert(
  "sessionActorKey prefers userId",
  authCookie.includes("export function sessionActorKey")
);
assert(
  "legacy password behind flag",
  authCookie.includes("ALLOW_LEGACY_STAFF_PASSWORD") &&
    login.includes("isLegacyStaffPasswordAllowed") &&
    login.includes("legacySharedPassword")
);

assert(
  "login uses Supabase email password",
  login.includes("loginWithEmailPassword") &&
    staffAuth.includes("signInWithPassword")
);
assert(
  "login issues staff cookie + sb tokens",
  login.includes("AUTH_COOKIE_NAME") &&
    login.includes("SB_ACCESS_COOKIE_NAME") &&
    login.includes("SB_REFRESH_COOKIE_NAME")
);
assert(
  "service_role not in client login page",
  !loginPage.includes("SERVICE_ROLE") &&
    !loginPage.includes("getServiceRoleSupabase")
);
assert(
  "no public signup UI",
  !loginPage.includes("新規登録") &&
    !loginPage.includes("signUp") &&
    loginPage.includes('type="email"')
);

assert(
  "logout clears staff + supabase cookies",
  logout.includes("signOutSupabaseTokens") &&
    logout.includes("SB_ACCESS_COOKIE_NAME") &&
    logout.includes("assertCsrf") &&
    logout.includes("assertAppOrigin")
);
assert("me route exists", me.includes("assertStaffSessionStillAllowed"));
assert(
  "inactive blocked",
  staffAuth.includes("is_active") && me.includes("INACTIVE")
);

assert(
  "sidebar shows logged-in user",
  sidebar.includes("ログイン中") &&
    sidebar.includes("/api/auth/me") &&
    sidebar.includes("onLogout")
);
assert(
  "proxy still gates non-login",
  proxy.includes('pathname === "/api/auth/login"') &&
    proxy.includes("unsealStaffSession")
);

assert(
  "attachments store uploaded_by_user_id + label",
  attachCore.includes("uploaded_by_user_id") &&
    attachCore.includes("uploadedByLabel") &&
    attachCore.includes("deleted_by_user_id")
);
assert(
  "case-registrations uses sessionActorKey",
  caseReg.includes("sessionActorKey(session)")
);
assert(
  "docs cover signup off / invite / profiles",
  docs.includes("Public signup") &&
    docs.includes("staff_profiles") &&
    docs.includes("Invite")
);
assert(
  "staffAuth uses publishable for signIn, service_role for profile",
  staffAuth.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") &&
    staffAuth.includes("getServiceRoleSupabase") &&
    staffAuth.includes('import "server-only"')
);

const unit = spawnSync("npx", ["tsx", "lib/gateway/authCookie.test.ts"], {
  cwd: ROOT,
  encoding: "utf8",
  env: {
    ...process.env,
    INTERNAL_AUTH_SECRET: "test-secret-at-least-32-characters-long!!",
  },
});
assert("authCookie unit tests", unit.status === 0, unit.stdout + unit.stderr);

const attach = spawnSync(
  "node",
  ["scripts/pr-case-attachments-contract-test.mjs"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "attachments contract still passes",
  attach.status === 0,
  attach.stdout + attach.stderr
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll staff supabase auth contract checks passed");
