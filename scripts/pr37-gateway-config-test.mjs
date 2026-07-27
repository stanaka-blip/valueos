/**
 * Origin / secret / password 設定エラーの Route レベル確認
 */
import { spawn, execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
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

function clearLock() {
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

async function withServer(envExtra, port, fn) {
  clearLock();
  await sleep(600);
  const child = spawn("npx", ["next", "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      GATEWAY_RATE_LIMIT_STUB: "allow",
      GATEWAY_RPC_STUB: "success",
      ...envExtra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`${base}/login`)).ok) break;
      } catch {
        // wait
      }
      await sleep(500);
    }
    await fn(base);
  } finally {
    child.kill("SIGKILL");
    clearLock();
    await sleep(700);
  }
}

const goodSecret = randomBytes(32).toString("hex");
const goodPassword = "config-test-password";

// 10: missing INTERNAL_APP_ORIGIN => 503
await withServer(
  {
    INTERNAL_APP_PASSWORD: goodPassword,
    INTERNAL_AUTH_SECRET: goodSecret,
    // no INTERNAL_APP_ORIGIN
  },
  3031,
  async (base) => {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ password: goodPassword }),
    });
    const data = await r.json();
    assert("10 origin unset 503", r.status === 503 && data.error_code === "CONFIG_ERROR", JSON.stringify(data));
  }
);

// 16: password unset => 503
await withServer(
  {
    INTERNAL_APP_ORIGIN: "http://127.0.0.1:3032",
    INTERNAL_AUTH_SECRET: goodSecret,
    INTERNAL_APP_PASSWORD: "",
  },
  3032,
  async (base) => {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3032" },
      body: JSON.stringify({ password: "x" }),
    });
    const data = await r.json();
    assert("16 password unset 503", r.status === 503 && data.error_code === "CONFIG_ERROR", JSON.stringify(data));
  }
);

// 14/15: short secret => 503
await withServer(
  {
    INTERNAL_APP_ORIGIN: "http://127.0.0.1:3033",
    INTERNAL_APP_PASSWORD: goodPassword,
    INTERNAL_AUTH_SECRET: "tooshort",
  },
  3033,
  async (base) => {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3033" },
      body: JSON.stringify({ password: goodPassword }),
    });
    const data = await r.json();
    assert("15 short secret 503", r.status === 503 && data.error_code === "CONFIG_ERROR", JSON.stringify(data));
  }
);

// 18/19 login rate limit deny stub
await withServer(
  {
    INTERNAL_APP_ORIGIN: "http://127.0.0.1:3034",
    INTERNAL_APP_PASSWORD: goodPassword,
    INTERNAL_AUTH_SECRET: goodSecret,
    GATEWAY_RATE_LIMIT_STUB: "deny",
  },
  3034,
  async (base) => {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3034" },
      body: JSON.stringify({ password: goodPassword }),
    });
    assert("18/19 login rate limited", r.status === 429);
  }
);

console.log(failed === 0 ? "\nALL_CONFIG_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
