/**
 * stacked PR: Role / Permission / Scope Core 契約テスト（本番 DB 書込なし）
 * Run: node scripts/pr-role-permission-scope-contract-test.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const migrationName = "20260814100000_role_permission_scope_core.sql";
assert(
  "migration exists",
  existsSync(join(ROOT, "supabase/migrations", migrationName))
);

const migration = read(`supabase/migrations/${migrationName}`);
const orgMigration = read(
  "supabase/migrations/20260814090000_organization_core.sql"
);
const dbTypes = read("lib/database.types.ts");
const codes = read("lib/rbac/rbacCodes.ts");
const logic = read("lib/rbac/rbacCoreLogic.ts");
const staffAuth = read("lib/auth/staffAuth.ts");
const proxy = read("proxy.ts");
const staffProfilesMig = read(
  "supabase/migrations/20260808220000_staff_profiles_and_attachment_actors.sql"
);
const staffAdminMig = read(
  "supabase/migrations/20260808230000_staff_profiles_is_admin.sql"
);

assert(
  "creates rbac core tables",
  migration.includes("CREATE TABLE IF NOT EXISTS public.roles") &&
    migration.includes("CREATE TABLE IF NOT EXISTS public.permissions") &&
    migration.includes("CREATE TABLE IF NOT EXISTS public.role_permissions") &&
    migration.includes("CREATE TABLE IF NOT EXISTS public.scopes") &&
    migration.includes(
      "CREATE TABLE IF NOT EXISTS public.organization_membership_roles"
    )
);

assert(
  "role/permission/scope code UNIQUE",
  migration.includes("roles_code_unique") &&
    migration.includes("permissions_code_unique") &&
    migration.includes("scopes_code_unique")
);

assert(
  "membership role unique + scope_id",
  migration.includes("organization_membership_roles_membership_role_unique") &&
    migration.includes("UNIQUE (organization_membership_id, role_id)") &&
    /scope_id uuid NOT NULL/.test(migration)
);

assert(
  "membership roles FK to organization_memberships",
  migration.includes("REFERENCES public.organization_memberships (id)")
);

assert(
  "seeds 5 roles / 5 permissions / 4 scopes idempotent",
  migration.includes("'ADMIN'") &&
    migration.includes("'MANAGER'") &&
    migration.includes("'SALES'") &&
    migration.includes("'BACK_OFFICE'") &&
    migration.includes("'GENERAL'") &&
    migration.includes("'VIEW'") &&
    migration.includes("'CREATE'") &&
    migration.includes("'EDIT'") &&
    migration.includes("'APPROVE'") &&
    migration.includes("'EXPORT'") &&
    migration.includes("'SELF'") &&
    migration.includes("'TEAM'") &&
    migration.includes("'ORGANIZATION'") &&
    migration.includes("'ALL'") &&
    (migration.match(/ON CONFLICT \(code\) DO NOTHING/g) || []).length >= 3
);

assert(
  "DELETE not a standard permission seed",
  !/INSERT INTO public\.permissions[\s\S]*'DELETE'/.test(migration)
);

assert(
  "no mass role_permissions business matrix seed",
  !/INSERT INTO public\.role_permissions/.test(migration)
);

assert(
  "does not alter staff_profiles / auth / legacy masters / cases",
  !/ALTER\s+TABLE\s+public\.staff_profiles/i.test(migration) &&
    !/DROP\s+TABLE\s+public\.staff_profiles/i.test(migration) &&
    !/ALTER\s+TABLE\s+public\.(dealers|contractors|suppliers|cases)/i.test(
      migration
    ) &&
    !/proxy\.ts/.test(migration)
);

assert(
  "organization core migration still present",
  orgMigration.includes("CREATE TABLE IF NOT EXISTS public.organizations") &&
    orgMigration.includes("organization_memberships")
);

assert(
  "RLS service_role only, no open policies",
  migration.includes("ENABLE ROW LEVEL SECURITY") &&
    migration.includes("REVOKE ALL ON TABLE public.roles FROM anon") &&
    migration.includes(
      "REVOKE ALL ON TABLE public.roles FROM authenticated"
    ) &&
    migration.includes(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.roles TO service_role"
    ) &&
    !/USING\s*\(\s*true\s*\)/.test(migration) &&
    !/CREATE POLICY/.test(migration)
);

assert(
  "future resource permission comment present",
  migration.includes("Resource") || migration.includes("CASE_EDIT")
);

assert(
  "database.types additive rbac tables",
  dbTypes.includes("roles:") &&
    dbTypes.includes("permissions:") &&
    dbTypes.includes("role_permissions:") &&
    dbTypes.includes("scopes:") &&
    dbTypes.includes("organization_membership_roles:") &&
    dbTypes.includes("export type RoleRow") &&
    dbTypes.includes("export type OrganizationMembershipRoleRow") &&
    dbTypes.includes("staff_profiles:") &&
    dbTypes.includes("organizations:")
);

assert(
  "TS codes managed centrally",
  codes.includes("ROLE_CODES") &&
    codes.includes("PERMISSION_CODES") &&
    codes.includes("SCOPE_CODES") &&
    codes.includes("SCOPE_STRENGTH")
);

assert(
  "pure logic covers inactive + multi-role + duplicate",
  logic.includes("DUPLICATE_MEMBERSHIP_ROLE") &&
    logic.includes("evaluateMembershipAuthz") &&
    logic.includes("is_active")
);

assert(
  "staff auth still uses staff_profiles",
  staffAuth.includes('from("staff_profiles")')
);

assert(
  "proxy still gates via staff cookie pattern",
  proxy.includes("isPublicPath") &&
    (proxy.includes("vos_staff") ||
      proxy.includes("unseal") ||
      proxy.includes("staff"))
);

assert(
  "staff_profiles + is_admin migrations untouched content still present",
  staffProfilesMig.includes("CREATE TABLE IF NOT EXISTS public.staff_profiles") &&
    staffAdminMig.includes("is_admin")
);

const unit = spawnSync("npx", ["tsx", "lib/rbac/rbacCoreLogic.test.ts"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("rbac unit tests", unit.status === 0, unit.stdout + unit.stderr);

const orgCore = spawnSync("npm", ["run", "test:organization-core"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert(
  "organization-core tests still pass",
  orgCore.status === 0,
  orgCore.stdout + orgCore.stderr
);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("tsc --noEmit", tsc.status === 0, tsc.stdout + tsc.stderr);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\npr-role-permission-scope-contract-test: all passed");
