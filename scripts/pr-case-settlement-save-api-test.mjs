/**
 * 案件詳細 決済保存 API テスト
 * 実行: node scripts/pr-case-settlement-save-api-test.mjs
 */
import { spawn, spawnSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
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

// ---------- static ----------
const formSrc = read("app/cases/[id]/SettlementForm.tsx");
const workflowSrc = read("app/cases/[id]/WorkflowPanel.tsx");
const submitSrc = read("app/cases/[id]/submitCaseSettlement.ts");
const routeSrc = read("app/api/cases/[id]/settlement/route.ts");
const saveSrc = read("lib/caseSettlements/saveCaseSettlement.ts");
const logicSrc = read("lib/caseSettlements/settlementSaveLogic.ts");

assert("route is PUT", routeSrc.includes("export async function PUT"));
assert("route checks Origin", routeSrc.includes("assertAppOrigin"));
assert("route checks session", routeSrc.includes("getSessionFromRequest"));
assert("route checks CSRF", routeSrc.includes("assertCsrf"));
assert("route checks JSON CT", routeSrc.includes("requireJsonContentType"));
assert("route uses service role save", routeSrc.includes("saveCaseSettlementByCaseId"));
assert("save uses getServiceRoleSupabase", saveSrc.includes("getServiceRoleSupabase"));
assert("save is server-only", saveSrc.includes('import "server-only"'));
assert("save supports UPDATE existing", saveSrc.includes(".update(built.patch)"));
assert("save supports INSERT new", saveSrc.includes(".insert({"));
assert("save checks case exists", saveSrc.includes('.from("cases")'));
assert(
  "form uses submitCaseSettlement",
  formSrc.includes("submitCaseSettlement") &&
    !formSrc.includes("upsertCaseSettlementByCaseId")
);
assert(
  "workflow uses submitCaseSettlement",
  workflowSrc.includes("submitCaseSettlement") &&
    !workflowSrc.includes("upsertCaseSettlementByCaseId")
);
assert("submit fetches csrf", submitSrc.includes('/api/auth/csrf'));
assert("submit sends CSRF header", submitSrc.includes("X-CSRF-Token"));
assert("submit uses PUT settlement", submitSrc.includes("/settlement"));
assert(
  "client files do not embed service role",
  !formSrc.includes("SERVICE_ROLE") &&
    !workflowSrc.includes("SERVICE_ROLE") &&
    !submitSrc.includes("SERVICE_ROLE") &&
    !submitSrc.includes("getServiceRoleSupabase")
);
assert("no migration added in this change set intent", !logicSrc.includes("ALTER TABLE"));
assert("sources settlement_form + workflow_panel", logicSrc.includes("settlement_form") && logicSrc.includes("workflow_panel"));

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-settlement-save-api-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

// ---------- HTTP (stub, no prod DB) ----------
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

const PORT = 3027;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;
const PASSWORD = "test-settlement-gateway-password";
const SECRET = randomBytes(32).toString("hex");
const CASE_ID = "11111111-1111-4111-8111-111111111111";

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
      GATEWAY_SETTLEMENT_STUB: "success",
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
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/settlement`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
      },
      body: JSON.stringify({
        source: "settlement_form",
        settlement_type: "前金",
        fee_amount: 0,
      }),
    });
    const data = await r.json();
    assert("unauth → 401", r.status === 401 && data.error_code === "UNAUTHORIZED", `${r.status} ${JSON.stringify(data)}`);
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
    assert("bad origin → 403", r.status === 403 && data.error_code === "FORBIDDEN", `${r.status}`);
  }

  {
    const r = await fetch(`${BASE}/api/cases/${CASE_ID}/settlement`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${cookie}`,
        "X-CSRF-Token": "wrong-csrf-token-value-xxx",
      },
      body: JSON.stringify({
        source: "settlement_form",
        settlement_type: "前金",
        fee_amount: 0,
      }),
    });
    const data = await r.json();
    assert("bad csrf → 403", r.status === 403 && data.error_code === "FORBIDDEN", `${r.status}`);
  }

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
        settlement_type: "前金",
        fee_amount: 0,
      }),
    });
    const data = await r.json();
    assert(
      "authed stub save → 200",
      r.status === 200 && data.ok === true && typeof data.settlement_id === "string",
      JSON.stringify(data)
    );
    assert(
      "response has no service role leak",
      !JSON.stringify(data).toLowerCase().includes("service") &&
        !JSON.stringify(data).includes("SERVICE_ROLE")
    );
  }

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
        source: "workflow_panel",
        loan_status: "申請中",
        card_status: "処理中",
      }),
    });
    const data = await r.json();
    assert(
      "workflow stub → 200",
      r.status === 200 && data.ok === true,
      JSON.stringify(data)
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
console.log("\nAll case-settlement save API checks passed");
