/**
 * settlement save verify hotfix テスト
 * 実行: node scripts/pr-settlement-save-verify-hotfix-test.mjs
 */
import { spawn, spawnSync, execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { randomBytes } from "node:crypto";

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

const routeSrc = read("app/api/cases/[id]/settlement/route.ts");
const pageSrc = read("app/cases/[id]/page.tsx");
const saveSrc = read("lib/caseSettlements/saveCaseSettlementCore.ts");
const stubSrc = read("lib/caseSettlements/settlementStubGate.ts");
const adminSrc = read("lib/caseSettlements/getCaseSettlementAdmin.ts");

assert("route has no GATEWAY_SETTLEMENT_STUB", !routeSrc.includes("GATEWAY_SETTLEMENT_STUB"));
assert("route has no fixed stub UUID", !routeSrc.includes("22222222-2222-2222-2222-222222222222"));
assert("route verifies settlement_id isUuid", routeSrc.includes("isUuid(result.settlement_id)"));
assert("save verifies after write", saveSrc.includes("verifyPersisted") && saveSrc.includes("settlementRowMatchesPatch"));
assert("stub gate blocks production/preview", stubSrc.includes('vercelEnv === "production"') && stubSrc.includes('vercelEnv === "preview"'));
assert("page uses admin service_role read", pageSrc.includes("getCaseSettlementByCaseIdAdmin"));
assert("page does not use anon getCaseSettlementByCaseId", !pageSrc.includes("getCaseSettlementByCaseId("));
assert("admin is server-only", adminSrc.includes('import "server-only"'));
assert("page treats read failure distinctly", pageSrc.includes("settlementError") && pageSrc.includes("読取失敗は未設定"));

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-settlement-save-verify-hotfix-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

// Keep prior settlement API behavior suite green
const prior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-settlement-save-api-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(prior.stdout || "");
process.stderr.write(prior.stderr || "");
assert("prior behavior exit 0", prior.status === 0, `status=${prior.status}`);

// HTTP: auth only (no stub success path)
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

const PORT = 3028;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;
const PASSWORD = "test-settlement-hotfix-password";
const SECRET = randomBytes(32).toString("hex");
const CASE_ID = "545b5859-f777-4038-9e22-10c6d46c0139";

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
      VERCEL_ENV: "production", // 本番相当: stub経路が残っていても使えないことを間接確認
      INTERNAL_APP_PASSWORD: PASSWORD,
      INTERNAL_AUTH_SECRET: SECRET,
      INTERNAL_APP_ORIGIN: ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-for-browser",
      GATEWAY_RATE_LIMIT_STUB: "allow",
      GATEWAY_SETTLEMENT_STUB: "success", // 旧変数が残っていても無視されること
      ALLOW_GATEWAY_SETTLEMENT_STUB: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

try {
  await waitReady();

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/settlement`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        source: "settlement_form",
        settlement_type: "3社間決済",
        finance_company: "イオン",
        approval_number: "1111",
        fee_amount: 0,
      }),
    });
    const data = await r.json();
    assert("unauth → 401", r.status === 401 && data.error_code === "UNAUTHORIZED");
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
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/settlement`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://evil.example",
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        source: "settlement_form",
        settlement_type: "前金",
        fee_amount: 0,
      }),
    });
    const data = await r.json();
    assert("bad origin → 403", r.status === 403 && data.error_code === "FORBIDDEN");
  }

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/settlement`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": "wrong",
      },
      body: JSON.stringify({
        source: "settlement_form",
        settlement_type: "前金",
        fee_amount: 0,
      }),
    });
    const data = await r.json();
    assert("bad csrf → 403", r.status === 403 && data.error_code === "FORBIDDEN");
  }

  // 本番相当(VERCEL_ENV=production)では旧stub変数があっても偽successにならない
  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/settlement`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        source: "settlement_form",
        settlement_type: "3社間決済",
        finance_company: "イオン",
        approval_number: "1111",
        fee_amount: 0,
      }),
    });
    const data = await r.json();
    assert(
      "prod-like env does not stub-succeed",
      !(r.status === 200 && data.settlement_id === "22222222-2222-2222-2222-222222222222"),
      JSON.stringify(data)
    );
    assert(
      "no fake stub id in response",
      !JSON.stringify(data).includes("22222222-2222-2222-2222-222222222222")
    );
  }
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
console.log("\nAll settlement save verify hotfix checks passed");
