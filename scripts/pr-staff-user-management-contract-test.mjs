/**
 * 社内ユーザー管理 (/staff) 契約テスト
 * 実行: node scripts/pr-staff-user-management-contract-test.mjs
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

const mig = read(
  "supabase/migrations/20260808230000_staff_profiles_is_admin.sql"
);
const core = read("lib/staff/staffAdminCore.ts");
const http = read("lib/staff/httpAuth.ts");
const staffAuth = read("lib/auth/staffAuth.ts");
const me = read("app/api/auth/me/route.ts");
const listRoute = read("app/api/staff/route.ts");
const activeRoute = read("app/api/staff/[id]/active/route.ts");
const resendRoute = read("app/api/staff/[id]/resend-invite/route.ts");
const page = read("app/staff/page.tsx");
const sidebar = read("app/components/AppSidebar.tsx");
const docs = read("docs/staff-supabase-auth.md");

assert(
  "is_admin additive migration",
  mig.includes("ADD COLUMN IF NOT EXISTS is_admin") &&
    !/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+public\.staff_profiles\s+SET/i.test(mig)
);
assert(
  "invite uses auth.admin.inviteUserByEmail",
  core.includes("inviteUserByEmail") && core.includes('import "server-only"')
);
assert(
  "service_role via getServiceRoleSupabase only",
  core.includes("getServiceRoleSupabase") &&
    !page.includes("SERVICE_ROLE") &&
    !page.includes("getServiceRoleSupabase")
);
assert(
  "admin gate NOT_ADMIN",
  http.includes("NOT_ADMIN") && http.includes("requireStaffAdminMutation")
);
assert(
  "list/invite/active/resend routes",
  listRoute.includes("listStaffUsers") &&
    listRoute.includes("inviteStaffUser") &&
    activeRoute.includes("setStaffActive") &&
    resendRoute.includes("resendStaffInvite")
);
assert(
  "cannot deactivate self / last admin",
  core.includes("CANNOT_DEACTIVATE_SELF") && core.includes("LAST_ADMIN")
);
assert(
  "soft disable only",
  core.includes("is_active") && !core.includes("auth.admin.deleteUser")
);
assert(
  "me returns isAdmin",
  me.includes("isAdmin: allowed.isAdmin") &&
    staffAuth.includes("is_admin") &&
    staffAuth.includes("isAdmin:")
);
assert(
  "UI /staff list + invite",
  page.includes("ユーザー管理") &&
    page.includes("＋ユーザー追加") &&
    page.includes("display_name") &&
    page.includes("招待再送")
);
assert(
  "sidebar admin-only nav",
  sidebar.includes("ユーザー管理") &&
    sidebar.includes("me?.isAdmin") &&
    sidebar.includes('href: "/staff"')
);
assert(
  "docs bootstrap first admin + /staff",
  docs.includes("is_admin") &&
    docs.includes("/staff") &&
    docs.includes("最初の管理者")
);
assert(
  "Origin CSRF on mutations",
  http.includes("assertAppOrigin") && http.includes("assertCsrf")
);

const authContract = spawnSync(
  "node",
  ["scripts/pr-staff-supabase-auth-contract-test.mjs"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "existing auth contract still passes",
  authContract.status === 0,
  authContract.stdout + authContract.stderr
);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("tsc --noEmit", tsc.status === 0, tsc.stdout + tsc.stderr);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll staff user management contract checks passed");
