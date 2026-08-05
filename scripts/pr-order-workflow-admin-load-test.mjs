/**
 * 発注登録 Workflow admin 読取 静的契約テスト
 * Run: node scripts/pr-order-workflow-admin-load-test.mjs
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

const page = read("app/cases/[id]/orders/new/page.tsx");
const action = read("app/cases/[id]/orders/fetchCaseWorkflowAction.ts");
const client = read("app/cases/[id]/orders/fetchCaseWorkflow.ts");
const admin = read("lib/workflow/loadCaseWorkflowAdmin.ts");
const core = read("lib/workflow/evaluateCaseWorkflowFromSettlement.ts");

assert(
  "orders/new does not call loadCaseWorkflow directly",
  !page.includes('from "@/lib/workflow/loadCaseWorkflow"') &&
    !page.includes("loadCaseWorkflow(")
);
assert(
  "orders/new uses fetchCaseWorkflowForOrderPage",
  page.includes("fetchCaseWorkflowForOrderPage")
);
assert(
  "admin loader uses getCaseSettlementByCaseIdAdmin",
  admin.includes("getCaseSettlementByCaseIdAdmin")
);
assert(
  "server action authenticates staff cookie",
  action.includes("unsealStaffSession") && action.includes("AUTH_COOKIE_NAME")
);
assert(
  "core distinguishes read failure from unset",
  core.includes("SETTLEMENT_READ_FAILED") &&
    core.includes("settlementMissing")
);
assert(
  "files exist",
  existsSync(join(ROOT, "lib/workflow/loadCaseWorkflowAdmin.ts")) &&
    existsSync(join(ROOT, "lib/workflow/evaluateCaseWorkflowFromSettlement.ts")) &&
    existsSync(join(ROOT, "app/cases/[id]/orders/fetchCaseWorkflowAction.ts"))
);
assert(
  "client wrapper uses server action only",
  client.includes("fetchCaseWorkflowAction") &&
    client.includes("fetchCaseWorkflowForOrderPage") &&
    !/\bloadCaseWorkflow\b/.test(client)
);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
const porcelain = status.stdout || "";
assert("no dealer path changes", !/app\/dealer\//.test(porcelain));
assert(
  "no migration / rpc changes in WT",
  !/supabase\/migrations\//.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain)
);
assert(
  "WorkflowEngine / SETTLEMENT_RULES untouched",
  !/lib\/workflow\/WorkflowEngine\.ts/.test(porcelain) &&
    !/lib\/workflow\/settlementRules\.ts/.test(porcelain)
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-order-workflow-admin-load-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll order workflow admin load checks passed");
