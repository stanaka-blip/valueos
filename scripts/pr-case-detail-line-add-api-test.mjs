/**
 * PR-B: 案件詳細 明細追加 API（RPC + 冪等）
 * 実行: node scripts/pr-case-detail-line-add-api-test.mjs
 */
import { spawn, spawnSync, execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

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

const routeSrc = read("app/api/cases/[id]/lines/route.ts");
const addSrc = read("lib/caseLines/addCaseLine.ts");
const coreSrc = read("lib/caseLines/addCaseLineCore.ts");
const logicSrc = read("lib/caseLines/addCaseLineLogic.ts");
const dtoSrc = read("lib/caseLines/safeCaseLineDto.ts");
const migrationSrc = read(
  "supabase/migrations/20260801170000_append_case_line_rpc.sql"
);
const productsNewSrc = read("app/cases/[id]/products/new/page.tsx");
const authSrc = read("lib/gateway/authCookie.ts");

assert("route is POST", routeSrc.includes("export async function POST"));
assert("route checks Origin", routeSrc.includes("assertAppOrigin"));
assert("route checks session", routeSrc.includes("getSessionFromRequest"));
assert("route checks CSRF", routeSrc.includes("assertCsrf"));
assert("route checks JSON CT", routeSrc.includes("requireJsonContentType"));
assert(
  "route requires Idempotency-Key",
  routeSrc.includes("idempotency-key") && routeSrc.includes("Idempotency-Key が必要")
);
assert(
  "route derives request id from session",
  routeSrc.includes("deriveCaseLineAppendRequestId")
);
assert(
  "route ignores client request_id/case_id",
  routeSrc.includes("_ignoredRequestId") && routeSrc.includes("_ignoredCaseId")
);
assert("route uses addCaseLineByCaseId", routeSrc.includes("addCaseLineByCaseId"));
assert("add uses getServiceRoleSupabase", addSrc.includes("getServiceRoleSupabase"));
assert("add is server-only", addSrc.includes('import "server-only"'));
assert("core calls append_case_line RPC", coreSrc.includes('rpc("append_case_line"'));
assert("no compensation delete in core", !coreSrc.includes("cleanupLineArtifacts") && !coreSrc.includes(".delete()"));
assert("qty bounds in logic", logicSrc.includes("MAX_LINE_QTY") && logicSrc.includes("9999"));
assert("safe dto has REQUEST_ID_CONFLICT", dtoSrc.includes("REQUEST_ID_CONFLICT"));
assert(
  "migration defines RPC + ledger",
  migrationSrc.includes("append_case_line") &&
    migrationSrc.includes("case_line_append_requests") &&
    migrationSrc.includes("SECURITY INVOKER") &&
    migrationSrc.includes("pg_advisory_xact_lock")
);
assert(
  "migration revokes anon/authenticated",
  migrationSrc.includes("REVOKE ALL ON FUNCTION public.append_case_line") &&
    migrationSrc.includes("FROM anon") &&
    migrationSrc.includes("GRANT EXECUTE") &&
    migrationSrc.includes("TO service_role")
);
assert(
  "products/new form not replaced in this PR",
  productsNewSrc.includes('.from("case_products").insert')
);
assert(
  "deriveCaseLineAppendRequestId namespace separated",
  authSrc.includes("case-line-append:v1")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-detail-line-add-api-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

const db = spawnSync("node", ["scripts/pr-case-detail-line-add-api-db-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(db.stdout || "");
process.stderr.write(db.stderr || "");
assert("db test exit 0", db.status === 0, `status=${db.status}`);

function clearNextLock() {
  try {
    execSync("pkill -f 'next dev' || true", { stdio: "ignore" });
  } catch {
    // ignore
  }
  try {
    rmSync(join(ROOT, ".next/dev/lock"), { force: true });
  } catch {
    // ignore
  }
}

const PORT = 3029;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;
const PASSWORD = "test-case-line-add-password";
const SECRET = randomBytes(32).toString("hex");
const CASE_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  const joined = raw.length ? raw : [res.headers.get("set-cookie") || ""];
  const map = new Map();
  for (const line of joined) {
    if (!line) continue;
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return map;
}

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error("server not ready");
}

clearNextLock();
const child = spawn(
  "npx",
  ["next", "dev", "--port", String(PORT), "--hostname", "127.0.0.1"],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "development",
      INTERNAL_APP_PASSWORD: PASSWORD,
      INTERNAL_AUTH_SECRET: SECRET,
      INTERNAL_APP_ORIGIN: ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-for-browser",
      GATEWAY_RATE_LIMIT_STUB: "allow",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverLog = "";
child.stdout.on("data", (d) => {
  serverLog += d.toString();
});
child.stderr.on("data", (d) => {
  serverLog += d.toString();
});

try {
  await waitReady();

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/lines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        line_type: "PRODUCT",
        product_id: PRODUCT_ID,
        quantity: 1,
      }),
    });
    const data = await r.json();
    assert(
      "unauth → 401",
      r.status === 401 && data.error_code === "UNAUTHORIZED",
      `${r.status} ${JSON.stringify(data)}`
    );
  }

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const loginData = await login.json();
  const cookies = parseSetCookie(login);
  const cookie = cookies.get("vos_staff_session") || "";
  const csrf = loginData.csrfToken || "";
  assert("login ok", login.ok && !!cookie && !!csrf);

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/lines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://evil.example",
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": csrf,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        line_type: "PRODUCT",
        product_id: PRODUCT_ID,
        quantity: 1,
      }),
    });
    const data = await r.json();
    assert(
      "bad origin → 403",
      r.status === 403 && data.error_code === "FORBIDDEN",
      `${r.status}`
    );
  }

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/lines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": "wrong-csrf-token-value-xxx",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        line_type: "PRODUCT",
        product_id: PRODUCT_ID,
        quantity: 1,
      }),
    });
    const data = await r.json();
    assert(
      "bad csrf → 403",
      r.status === 403 && data.error_code === "FORBIDDEN",
      `${r.status}`
    );
  }

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/lines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        line_type: "PRODUCT",
        product_id: PRODUCT_ID,
        quantity: 1,
      }),
    });
    const data = await r.json();
    assert(
      "missing Idempotency-Key → 400",
      r.status === 400 && data.error_code === "BAD_REQUEST",
      `${r.status} ${JSON.stringify(data)}`
    );
  }

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/lines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": csrf,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        line_type: "PRODUCT",
        product_id: PRODUCT_ID,
        quantity: 1,
      }),
    });
    const data = await r.json();
    assert(
      "authed without real DB is not fake-success",
      !(r.status === 200 && data.ok === true),
      JSON.stringify(data)
    );
    const raw = JSON.stringify(data);
    assert(
      "response has no service role / SQL leak",
      !raw.includes("SERVICE_ROLE") &&
        !raw.includes("service-role-test-not-for-browser") &&
        !raw.includes("SQLSTATE") &&
        !raw.includes("constraint")
    );
  }

  assert(
    "server log has no service role key",
    !serverLog.includes("service-role-test-not-for-browser")
  );
} catch (e) {
  failed += 1;
  console.error("FAIL http suite", e);
} finally {
  child.kill("SIGTERM");
  clearNextLock();
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll case-detail line-add API checks passed");
