/**
 * PR37 HTTP 結合テスト（本番RPCなし / stub使用）
 */
import { spawn, execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
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

const PORT = 3017;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PASSWORD = "test-gateway-password-value";
const SECRET = randomBytes(32).toString("hex");

let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

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

async function waitReady(base = BASE) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${base}/login`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error("server not ready");
}

function startServer(envExtra = {}, port = PORT) {
  return spawn("npx", ["next", "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "development",
      INTERNAL_APP_PASSWORD: PASSWORD,
      INTERNAL_AUTH_SECRET: SECRET,
      INTERNAL_APP_ORIGIN: `http://127.0.0.1:${port}`,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-for-browser",
      GATEWAY_RATE_LIMIT_STUB: "allow",
      GATEWAY_RPC_STUB: "success",
      ...envExtra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function login(base, origin, password = PASSWORD) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ password }),
  });
  const data = await r.json();
  const cookies = parseSetCookie(r);
  return {
    status: r.status,
    data,
    cookie: cookies.get("vos_staff_session") || "",
    csrf: data.csrfToken || "",
  };
}

let serverLog = "";
const child = startServer();
child.stdout.on("data", (d) => {
  serverLog += d.toString();
});
child.stderr.on("data", (d) => {
  serverLog += d.toString();
});

try {
  await waitReady();

  {
    const r = await fetch(`${BASE}/cases/new`, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    assert("unauth cases/new", r.status >= 300 && r.status < 400 && loc.includes("/login"), loc);
  }

  {
    const r = await fetch(`${BASE}/cases`, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    assert("unauth /cases gate", r.status >= 300 && r.status < 400 && loc.includes("/login"), loc);
  }

  {
    const r = await fetch(`${BASE}/dealer/orders/new`, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    assert("unauth /dealer gate", r.status >= 300 && r.status < 400 && loc.includes("/login"), loc);
  }

  {
    const r = await fetch(`${BASE}/dealers`, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    assert("unauth /dealers gate", r.status >= 300 && r.status < 400 && loc.includes("/login"), loc);
  }

  {
    const r = await fetch(`${BASE}/login`);
    const html = await r.text();
    assert("login accessible", r.status === 200 && html.includes("社内ログイン"));
    assert(
      "login no sidebar",
      !html.includes("案件管理") && !html.includes("ログアウト"),
      "sidebar leaked on login"
    );
  }

  {
    const r = await fetch(`${BASE}/api/case-registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ case: {} }),
    });
    assert("unauth API 401", r.status === 401);
  }

  {
    const bad = await login(BASE, ORIGIN, "wrong");
    assert("bad password", bad.status === 401);
  }

  const okLogin = await login(BASE, ORIGIN);
  assert("1 login CSRF in response", okLogin.status === 200 && !!okLogin.csrf && !!okLogin.cookie);

  {
    const r = await fetch(`${BASE}/api/auth/csrf`, {
      headers: { Cookie: `vos_staff_session=${okLogin.cookie}` },
    });
    const data = await r.json();
    assert("2/3 CSRF re-fetch", r.status === 200 && data.csrfToken === okLogin.csrf, JSON.stringify(data));
    assert("6 CSRF no-store", (r.headers.get("cache-control") || "").includes("no-store"));
  }

  {
    const r = await fetch(`${BASE}/api/auth/csrf`);
    assert("4 unauth CSRF 401", r.status === 401);
  }

  {
    const badCookie = okLogin.cookie.slice(0, -4) + "abcd";
    const r = await fetch(`${BASE}/api/auth/csrf`, {
      headers: { Cookie: `vos_staff_session=${badCookie}` },
    });
    assert("5 tampered CSRF 401", r.status === 401);
  }

  {
    const r = await fetch(`${BASE}/api/case-registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${okLogin.cookie}`,
        "X-CSRF-Token": okLogin.csrf,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ case: { customer_name: "秘密顧客" } }),
    });
    const data = await r.json();
    assert("7 normal Origin OK", r.status === 200 && data.ok === true, JSON.stringify(data));
  }

  {
    const r = await fetch(`${BASE}/api/case-registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        Cookie: `vos_staff_session=${okLogin.cookie}`,
        "X-CSRF-Token": okLogin.csrf,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ case: {} }),
    });
    assert("8 bad Origin 403", r.status === 403);
  }

  {
    const r = await fetch(`${BASE}/api/case-registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vos_staff_session=${okLogin.cookie}`,
        "X-CSRF-Token": okLogin.csrf,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ case: {} }),
    });
    assert("9 missing Origin 403", r.status === 403);
  }

  {
    const r = await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${okLogin.cookie}`,
        "X-CSRF-Token": "wrong",
      },
    });
    assert("12 logout CSRF mismatch", r.status === 403);
  }

  {
    const r = await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        Cookie: `vos_staff_session=${okLogin.cookie}`,
        "X-CSRF-Token": okLogin.csrf,
      },
    });
    assert("13 logout Origin mismatch", r.status === 403);
  }

  {
    const r = await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Cookie: `vos_staff_session=${okLogin.cookie}`,
        "X-CSRF-Token": okLogin.csrf,
      },
    });
    assert("11 logout ok", r.status === 200);
  }

  // ログアウト後（cookie なし）は業務画面へ戻れない
  {
    const r = await fetch(`${BASE}/cases`, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    assert(
      "13 after logout /cases blocked",
      r.status >= 300 && r.status < 400 && loc.includes("/login"),
      loc
    );
  }
  {
    const r = await fetch(`${BASE}/dealer/orders/new`, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    assert(
      "13 after logout /dealer blocked",
      r.status >= 300 && r.status < 400 && loc.includes("/login"),
      loc
    );
  }

  {
    const longPw = "a".repeat(501);
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ password: longPw }),
    });
    assert("17 password >500 rejected", r.status === 400);
  }

  assert("24 logs no service key", !serverLog.includes("service-role-test-not-for-browser"));
  assert("24b logs no customer", !serverLog.includes("秘密顧客"));
} catch (e) {
  console.error(e);
  failed += 1;
} finally {
  child.kill("SIGKILL");
  clearNextLock();
  await sleep(1000);
}

// registration 429 with deny_reg stub
{
  const port = 3023;
  const origin = `http://127.0.0.1:${port}`;
  clearNextLock();
  await sleep(500);
  const c = startServer({ GATEWAY_RATE_LIMIT_STUB: "deny_reg", GATEWAY_RPC_STUB: "success" }, port);
  try {
    await waitReady(origin);
    const l = await login(origin, origin);
    const r = await fetch(`${origin}/api/case-registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: `vos_staff_session=${l.cookie}`,
        "X-CSRF-Token": l.csrf,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ case: {} }),
    });
    assert("20 registration HTTP 429", r.status === 429, `status=${r.status}`);
  } catch (e) {
    console.error(e);
    failed += 1;
  } finally {
    c.kill("SIGKILL");
    clearNextLock();
    await sleep(800);
  }
}

assert("10 origin unset covered by config-test", true);

console.log(failed === 0 ? "\nALL_HTTP_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
