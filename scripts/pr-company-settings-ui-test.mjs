/**
 * PR #88: 会社情報設定画面 静的契約テスト
 * Run: node scripts/pr-company-settings-ui-test.mjs
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

const sidebar = read("app/components/AppSidebar.tsx");
const page = read("app/settings/company/page.tsx");
const submit = read("app/settings/company/submitCompanySettings.ts");
const api = read("app/api/settings/company/route.ts");
const dto = read("lib/companyInfo/companySettingsDto.ts");
const saveAdmin = read("lib/companyInfo/saveCompanySettingsAdmin.ts");

assert(
  "sidebar has 設定 > 会社情報",
  sidebar.includes('label: "設定"') &&
    sidebar.includes('name: "会社情報"') &&
    sidebar.includes('href: "/settings/company"')
);

assert(
  "settings page exists with required sections",
  existsSync(join(ROOT, "app/settings/company/page.tsx")) &&
    page.includes("基本情報") &&
    page.includes("請求書情報") &&
    page.includes("振込先") &&
    page.includes("適格請求書登録番号") &&
    page.includes("保存しました")
);

assert(
  "company_name required, others optional",
  page.includes('label="会社名"') &&
    page.includes("required") &&
    dto.includes("会社名は必須です") &&
    dto.includes("optionalText")
);

const getHandler = api.slice(
  api.indexOf("export async function GET"),
  api.indexOf("export async function PUT")
);
const putHandler = api.slice(api.indexOf("export async function PUT"));

assert(
  "API GET uses staff cookie only (no Origin/CSRF)",
  getHandler.includes("getSessionFromRequest") &&
    getHandler.includes("getCompanySettingsAdmin") &&
    !getHandler.includes("assertAppOrigin") &&
    !getHandler.includes("assertCsrf")
);

assert(
  "API PUT keeps Origin CSRF and service_role save",
  putHandler.includes("assertAppOrigin") &&
    putHandler.includes("assertCsrf") &&
    putHandler.includes("saveCompanySettingsAdmin") &&
    api.includes("getSessionFromRequest")
);

assert(
  "save admin is server-only",
  saveAdmin.includes('import "server-only"') &&
    saveAdmin.includes("getServiceRoleSupabase")
);

assert(
  "client uses CSRF then PUT",
  submit.includes('/api/auth/csrf') &&
    submit.includes("X-CSRF-Token") &&
    submit.includes('method: "PUT"') &&
    submit.includes("/api/settings/company")
);

assert(
  "client settings submit does not import service role",
  !submit.includes("getServiceRoleSupabase") &&
    !submit.includes("SUPABASE_SERVICE_ROLE")
);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
const porcelain = status.stdout || "";
assert(
  "no migration / workflow / dealer changes",
  !/supabase\/migrations\//.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain)
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-company-settings-ui-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll company settings UI checks passed");
