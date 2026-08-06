/**
 * PR #87: company_settings 基盤 静的契約テスト
 * Run: node scripts/pr-company-settings-foundation-test.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const migrationName = "20260806120000_company_settings.sql";
const migrationPath = join(ROOT, "supabase/migrations", migrationName);
assert("migration file exists", existsSync(migrationPath));

const migration = read(`supabase/migrations/${migrationName}`);
const admin = read("lib/companyInfo/getCompanySettingsAdmin.ts");
const core = read("lib/companyInfo/getCompanySettingsAdminCore.ts");
const types = read("lib/companyInfo/types.ts");
const dbTypes = read("lib/database.types.ts");

assert(
  "singleton boolean PK with CHECK (id)",
  migration.includes("id boolean PRIMARY KEY") &&
    migration.includes("CHECK (id)")
);

assert(
  "company_name NOT NULL",
  /company_name text NOT NULL/.test(migration)
);

assert(
  "seed company_name is 株式会社Value Ecology",
  migration.includes("'株式会社Value Ecology'") &&
    migration.includes("ON CONFLICT (id) DO NOTHING")
);

assert(
  "seed does not insert fake invoice or bank values",
  /INSERT INTO public\.company_settings \(id, company_name\)/.test(migration) &&
    !/INSERT INTO public\.company_settings[\s\S]*T0000000000000/.test(migration)
);

assert(
  "RLS enabled with no policies (service_role BYPASS)",
  migration.includes("ENABLE ROW LEVEL SECURITY") &&
    migration.includes("REVOKE ALL ON TABLE public.company_settings FROM anon") &&
    migration.includes(
      "REVOKE ALL ON TABLE public.company_settings FROM authenticated"
    ) &&
    migration.includes(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_settings TO service_role"
    )
);

assert(
  "reuses valueos_set_updated_at trigger",
  migration.includes("valueos_set_updated_at") &&
    migration.includes("company_settings_set_updated_at")
);

assert(
  "admin loader is server-only and uses getServiceRoleSupabase",
  admin.includes('import "server-only"') &&
    admin.includes("getServiceRoleSupabase") &&
    admin.includes("getCompanySettingsAdmin")
);

assert(
  "core distinguishes read failure from missing row",
  core.includes("COMPANY_SETTINGS_READ_FAILED") &&
    core.includes('source: "fallback"') &&
    core.includes("resolveCompanySettingsRead")
);

assert(
  "fallback has company name only defaults",
  types.includes('DEFAULT_COMPANY_NAME = "株式会社Value Ecology"') &&
    types.includes("createDefaultCompanySettings") &&
    types.includes("invoice_registration_number: null") &&
    types.includes("bank_account_number: null")
);

assert(
  "database.types includes company_settings",
  dbTypes.includes("company_settings:") &&
    dbTypes.includes("CompanySettingsRow") &&
    dbTypes.includes("invoice_registration_number")
);

assert(
  "no settings UI / print / sidebar in this PR",
  !existsSync(join(ROOT, "app/settings")) &&
    !read("app/components/AppSidebar.tsx").includes("/settings/company")
);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
const porcelain = status.stdout || "";
assert(
  "no print / workflow / dealer / auth changes",
  !/app\/invoices\/\[id\]\/print/.test(porcelain) &&
    !/app\/orders\/\[id\]\/print/.test(porcelain) &&
    !/app\/orders\/\[id\]\/delivery-print/.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/lib\/gateway\/authCookie/.test(porcelain)
);

assert(
  "does not modify older migrations",
  !readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f !== migrationName)
    .some((f) => porcelain.includes(`supabase/migrations/${f}`))
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-company-settings-foundation-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll company settings foundation checks passed");
