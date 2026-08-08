/**
 * 施工店マスタ Phase 1 契約テスト
 * Run: node scripts/pr-contractors-master-phase1-test.mjs
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

const migration = read(
  "supabase/migrations/20260808120000_create_contractors.sql"
);
const types = read("lib/database.types.ts");
const sidebar = read("app/components/AppSidebar.tsx");
const list = read("app/contractors/page.tsx");
const create = read("app/contractors/new/page.tsx");
const edit = read("app/contractors/[id]/edit/page.tsx");

assert(
  "migration creates contractors only",
  migration.includes("CREATE TABLE IF NOT EXISTS public.contractors") &&
    migration.includes("name text NOT NULL") &&
    migration.includes("postal_code") &&
    migration.includes("delivery_name") &&
    migration.includes("delivery_address") &&
    migration.includes("delivery_phone") &&
    migration.includes("receiver_name") &&
    migration.includes("is_active boolean NOT NULL DEFAULT true")
);
assert(
  "migration has no cases FK / backfill / destructive DML",
  !migration.includes("ALTER TABLE public.cases") &&
    !migration.includes("REFERENCES public.cases") &&
    !/\bUPDATE\s+public\./i.test(migration) &&
    !/\bDELETE\s+FROM\s+public\./i.test(migration) &&
    !/\bINSERT\s+INTO\s+public\.(?!contractors\b)/i.test(migration)
);
assert(
  "types include contractors",
  types.includes("contractors: {") &&
    types.includes("delivery_name: string | null") &&
    types.includes("receiver_name: string | null")
);
assert(
  "sidebar master link",
  sidebar.includes('name: "施工店"') &&
    sidebar.includes('href: "/contractors"')
);
assert(
  "CRUD routes exist",
  existsSync(join(ROOT, "app/contractors/page.tsx")) &&
    existsSync(join(ROOT, "app/contractors/new/page.tsx")) &&
    existsSync(join(ROOT, "app/contractors/[id]/edit/page.tsx"))
);
assert(
  "list columns cover required fields",
  list.includes("施工店名") &&
    list.includes("住所") &&
    list.includes("電話番号") &&
    list.includes("標準納品先") &&
    list.includes("荷受け担当者") &&
    list.includes("状態") &&
    list.includes("有効") &&
    list.includes("無効")
);
assert(
  "create/edit support is_active without delete UX",
  create.includes("is_active") &&
    edit.includes("is_active") &&
    !create.includes(".delete(") &&
    !edit.includes(".delete(") &&
    !list.includes("削除")
);
assert(
  "address labeled as contractor location, not site_address autofill",
  create.includes("施工店所在地") &&
    edit.includes("施工店所在地") &&
    !create.includes("site_address") &&
    !edit.includes("site_address")
);

const porcelain =
  spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout || "";

assert(
  "no forbidden area changes",
  !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/app\/cases\//.test(porcelain) &&
    !/create_case_registration/.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain) &&
    !/app\/invoices\//.test(porcelain) &&
    !/app\/payments\//.test(porcelain) &&
    !/app\/orders\//.test(porcelain)
);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(tsc.stdout || "");
process.stderr.write(tsc.stderr || "");
assert("tsc --noEmit", tsc.status === 0, `status=${tsc.status}`);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
assert("npm run build", build.status === 0, `status=${build.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll contractors master phase1 checks passed");
