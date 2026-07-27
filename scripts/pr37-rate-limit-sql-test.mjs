/**
 * gateway_rate_limits + cleanup を隔離DBで検証
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
-- Supabase 本番相当: service_role は BYPASSRLS（RLS ENABLE + policy 0件でも利用可能）
ALTER ROLE service_role BYPASSRLS;
`);
for (const f of [
  "20260727010000_gateway_rate_limits.sql",
  "20260727010100_gateway_rate_limit_cleanup.sql",
]) {
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", DB, "-v", "ON_ERROR_STOP=1", "-f", join(ROOT, "supabase/migrations", f)],
    { encoding: "utf8" }
  );
}

const r1 = JSON.parse(psql(`SELECT public.gateway_rate_limit_hit('t1', 2, 60)::text;`));
const r2 = JSON.parse(psql(`SELECT public.gateway_rate_limit_hit('t1', 2, 60)::text;`));
const r3 = JSON.parse(psql(`SELECT public.gateway_rate_limit_hit('t1', 2, 60)::text;`));
assert("hit1 allowed", r1.allowed === true);
assert("hit2 allowed", r2.allowed === true);
assert("hit3 denied", r3.allowed === false);

// parallel: 5 concurrent hits with limit 3 should not all succeed beyond limit
psql(`SELECT public.gateway_rate_limit_hit('par', 3, 60);`); // warm? actually reset with new key
const parallelSql = `
SELECT count(*) FILTER (WHERE (j->>'allowed')::boolean) AS allowed_count
FROM (
  SELECT public.gateway_rate_limit_hit('par2', 3, 60)::text AS j FROM generate_series(1, 8)
) s;
`;
// sequential generate_series in one statement still serializes in one backend — use dblink-less bash parallel
const out = execFileSync(
  "bash",
  [
    "-lc",
    `for i in 1 2 3 4 5 6; do sudo -u postgres psql -d ${DB} -At -c "SELECT public.gateway_rate_limit_hit('par3', 3, 60)::text;" & done; wait`,
  ],
  { encoding: "utf8" }
);
const allowed = out
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l))
  .filter((j) => j.allowed === true).length;
assert("21 parallel not over limit", allowed <= 3, `allowed=${allowed}`);

// cleanup: insert old row
psql(`
INSERT INTO gateway_rate_limits(bucket_key, window_started_at, hit_count)
VALUES ('old1', now() - interval '2 hours', 1)
ON CONFLICT (bucket_key) DO UPDATE SET window_started_at = excluded.window_started_at;
INSERT INTO gateway_rate_limits(bucket_key, window_started_at, hit_count)
VALUES ('fresh1', now(), 1)
ON CONFLICT (bucket_key) DO UPDATE SET window_started_at = excluded.window_started_at;
`);
const deleted = Number(psql(`SELECT public.gateway_rate_limit_cleanup(3600, 100);`));
assert("22 cleanup deleted old", deleted >= 1);
assert("22b fresh kept", psql(`SELECT count(*) FROM gateway_rate_limits WHERE bucket_key='fresh1';`) === "1");
assert("22c old gone", psql(`SELECT count(*) FROM gateway_rate_limits WHERE bucket_key='old1';`) === "0");

assert(
  "23 anon no execute hit",
  psql(`SELECT has_function_privilege('anon', 'public.gateway_rate_limit_hit(text,integer,integer)', 'EXECUTE');`) ===
    "f"
);
assert(
  "23 anon no execute cleanup",
  psql(
    `SELECT has_function_privilege('anon', 'public.gateway_rate_limit_cleanup(integer,integer)', 'EXECUTE');`
  ) === "f"
);
assert(
  "23 service_role execute cleanup",
  psql(
    `SELECT has_function_privilege('service_role', 'public.gateway_rate_limit_cleanup(integer,integer)', 'EXECUTE');`
  ) === "t"
);

console.log(failed === 0 ? "\nALL_SQL_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
