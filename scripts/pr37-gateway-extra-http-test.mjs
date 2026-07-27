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

async function withServer(envExtra, port, fn) {
  clearNextLock();
  await sleep(500);
  const PASSWORD = "test-gateway-password-value";
  const SECRET = randomBytes(32).toString("hex");
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn("npx", ["next", "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
      INTERNAL_APP_PASSWORD: PASSWORD,
      INTERNAL_AUTH_SECRET: SECRET,
      // Production と同仕様の完全一致検証を通し、テスト Origin だけを明示する（緩和しない）
      INTERNAL_APP_ORIGIN: origin,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      ...envExtra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = origin;
  let ready = false;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`${base}/login`)).ok) {
          ready = true;
          break;
        }
      } catch {
        // wait
      }
      await sleep(500);
    }
    if (!ready) throw new Error(`server not ready on ${port}`);
    await fn(base, PASSWORD, origin);
  } finally {
    child.kill("SIGKILL");
    clearNextLock();
    await sleep(800);
  }
}

let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

await withServer({ GATEWAY_RATE_LIMIT_STUB: "allow", GATEWAY_RPC_STUB: "failure" }, 3021, async (base, PASSWORD, origin) => {
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const loginData = await login.json();
  const setCookies = login.headers.getSetCookie?.() || [];
  const cookieLine = setCookies.find((x) => x.startsWith("vos_staff_session=")) || "";
  const cookie = cookieLine.split(";")[0].split("=")[1];
  const r = await fetch(`${base}/api/case-registrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: `vos_staff_session=${cookie}`,
      "X-CSRF-Token": loginData.csrfToken,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ case: {} }),
  });
  const data = await r.json();
  assert(
    "14 RPC failure DTO",
    r.status === 400 && data.ok === false && data.error_code === "PRICE_NOT_FOUND",
    JSON.stringify(data)
  );
});

await withServer({ GATEWAY_RATE_LIMIT_STUB: "deny", GATEWAY_RPC_STUB: "success" }, 3022, async (base, PASSWORD, origin) => {
  const rl = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const data = await rl.json();
  assert("16 login rate limited", rl.status === 429 && data.error_code === "RATE_LIMITED", JSON.stringify(data));
});

console.log(failed === 0 ? "\nALL_EXTRA_HTTP_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
