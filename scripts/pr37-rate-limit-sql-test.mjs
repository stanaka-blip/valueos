/**
 * gateway_rate_limits Migration を隔離DBで検証（本番なし）
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const DB = "valueos_pr37_rate_limit_test";
const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function psql(sql) {
  return execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", DB, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf8" }
  ).trim();
}

execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${DB};`], {
  encoding: "utf8",
});
execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${DB};`], {
  encoding: "utf8",
});
psql(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
`);
execFileSync(
  "sudo",
  [
    "-u",
    "postgres",
    "psql",
    "-d",
    DB,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    join(ROOT, "supabase/migrations/20260727010000_gateway_rate_limits.sql"),
  ],
  { encoding: "utf8" }
);

const r1 = JSON.parse(psql(`SELECT public.gateway_rate_limit_hit('t1', 2, 60)::text;`));
const r2 = JSON.parse(psql(`SELECT public.gateway_rate_limit_hit('t1', 2, 60)::text;`));
const r3 = JSON.parse(psql(`SELECT public.gateway_rate_limit_hit('t1', 2, 60)::text;`));
assert("17 hit1 allowed", r1.allowed === true);
assert("17 hit2 allowed", r2.allowed === true);
assert("17 hit3 denied", r3.allowed === false);

assert(
  "anon no execute",
  psql(`SELECT has_function_privilege('anon', 'public.gateway_rate_limit_hit(text,integer,integer)', 'EXECUTE');`) ===
    "f"
);
assert(
  "service_role execute",
  psql(
    `SELECT has_function_privilege('service_role', 'public.gateway_rate_limit_hit(text,integer,integer)', 'EXECUTE');`
  ) === "t"
);
assert(
  "anon no table",
  psql(`SELECT has_table_privilege('anon', 'public.gateway_rate_limits', 'SELECT');`) === "f"
);

console.log(failed === 0 ? "\nALL_SQL_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
