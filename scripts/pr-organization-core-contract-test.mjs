/**
 * PR: Organization Core 静的契約テスト（本番 DB 書込なし）
 * Run: node scripts/pr-organization-core-contract-test.mjs
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

const migrationName = "20260814090000_organization_core.sql";
const migrationPath = join(ROOT, "supabase/migrations", migrationName);
assert("migration file exists", existsSync(migrationPath));

const migration = read(`supabase/migrations/${migrationName}`);
const dbTypes = read("lib/database.types.ts");
const codes = read("lib/organizations/organizationTypeCodes.ts");
const logic = read("lib/organizations/organizationCoreLogic.ts");
const staffAuth = read("lib/auth/staffAuth.ts");
const staffProfilesMig = read(
  "supabase/migrations/20260808220000_staff_profiles_and_attachment_actors.sql"
);

assert(
  "creates four core tables",
  migration.includes("CREATE TABLE IF NOT EXISTS public.organizations") &&
    migration.includes("CREATE TABLE IF NOT EXISTS public.organization_types") &&
    migration.includes(
      "CREATE TABLE IF NOT EXISTS public.organization_type_assignments"
    ) &&
    migration.includes(
      "CREATE TABLE IF NOT EXISTS public.organization_memberships"
    )
);

assert(
  "organizations has required columns",
  /name text NOT NULL/.test(migration) &&
    /legal_name text/.test(migration) &&
    /is_active boolean NOT NULL DEFAULT true/.test(migration) &&
    /created_at timestamptz NOT NULL DEFAULT now\(\)/.test(migration) &&
    /updated_at timestamptz NOT NULL DEFAULT now\(\)/.test(migration)
);

assert(
  "organization_types separates code and display_name",
  /code text NOT NULL/.test(migration) &&
    /display_name text NOT NULL/.test(migration) &&
    migration.includes("organization_types_code_unique")
);

assert(
  "type assignment unique (organization_id, organization_type_id)",
  migration.includes("organization_type_assignments_org_type_unique") &&
    migration.includes("UNIQUE (organization_id, organization_type_id)")
);

assert(
  "membership unique (user_id, organization_id)",
  migration.includes("organization_memberships_user_org_unique") &&
    migration.includes("UNIQUE (user_id, organization_id)")
);

assert(
  "membership user_id references auth.users",
  migration.includes("REFERENCES auth.users (id) ON DELETE CASCADE")
);

assert(
  "seed four types idempotent ON CONFLICT DO NOTHING",
  migration.includes("'HEADQUARTERS'") &&
    migration.includes("'AGENCY'") &&
    migration.includes("'CONTRACTOR'") &&
    migration.includes("'TRADING'") &&
    migration.includes("ON CONFLICT (code) DO NOTHING")
);

assert(
  "no single organization_type column on organizations",
  (() => {
    const m = migration.match(
      /CREATE TABLE IF NOT EXISTS public\.organizations \(([\s\S]*?)\);/
    );
    if (!m) return false;
    const body = m[1];
    return (
      !/\borganization_type\b/.test(body) &&
      !/\btype_code\b/.test(body) &&
      !/\borg_type\b/.test(body)
    );
  })()
);

assert(
  "does not drop or alter legacy masters / cases / staff_profiles",
  !/DROP\s+TABLE\s+public\.(dealers|contractors|suppliers|manufacturers|cases|staff_profiles)/i.test(
    migration
  ) &&
    !/ALTER\s+TABLE\s+public\.(dealers|contractors|suppliers|manufacturers|cases|staff_profiles)/i.test(
      migration
    ) &&
    !/DELETE\s+FROM\s+public\.(dealers|contractors|suppliers|cases|staff_profiles)/i.test(
      migration
    )
);

assert(
  "RLS enabled without open anon/authenticated policies",
  migration.includes("ENABLE ROW LEVEL SECURITY") &&
    migration.includes("REVOKE ALL ON TABLE public.organizations FROM anon") &&
    migration.includes(
      "REVOKE ALL ON TABLE public.organizations FROM authenticated"
    ) &&
    migration.includes(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO service_role"
    ) &&
    !/CREATE POLICY[\s\S]*organizations/i.test(migration) &&
    !/USING\s*\(\s*true\s*\)/.test(migration)
);

assert(
  "reuses valueos_set_updated_at",
  migration.includes("valueos_set_updated_at") &&
    migration.includes("organizations_set_updated_at") &&
    migration.includes("organization_memberships_set_updated_at")
);

assert(
  "database.types includes organization tables",
  dbTypes.includes("organizations:") &&
    dbTypes.includes("organization_types:") &&
    dbTypes.includes("organization_type_assignments:") &&
    dbTypes.includes("organization_memberships:") &&
    dbTypes.includes("export type OrganizationRow") &&
    dbTypes.includes("export type OrganizationMembershipRow")
);

assert(
  "staff_profiles table definition remains in types",
  dbTypes.includes("staff_profiles:") &&
    dbTypes.includes("is_admin: boolean")
);

assert(
  "TS codes match seed",
  codes.includes("HEADQUARTERS") &&
    codes.includes("AGENCY") &&
    codes.includes("CONTRACTOR") &&
    codes.includes("TRADING") &&
    codes.includes("本社") &&
    codes.includes("代理店") &&
    codes.includes("施工店") &&
    codes.includes("商社")
);

assert(
  "core logic encodes uniqueness and inactive",
  logic.includes("DUPLICATE_TYPE_ASSIGNMENT") &&
    logic.includes("DUPLICATE_MEMBERSHIP") &&
    logic.includes("is_active")
);

assert(
  "staff auth path unchanged (staff_profiles still canonical)",
  staffAuth.includes('from("staff_profiles")') &&
    staffProfilesMig.includes("CREATE TABLE IF NOT EXISTS public.staff_profiles")
);

const unit = spawnSync(
  "npx",
  ["tsx", "lib/organizations/organizationCoreLogic.test.ts"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "organizationCoreLogic unit tests pass",
  unit.status === 0,
  unit.stdout + unit.stderr
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
console.log("\npr-organization-core-contract-test: all passed");
