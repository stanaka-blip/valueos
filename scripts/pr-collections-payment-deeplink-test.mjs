/**
 * PR95: 回収管理 → 入金登録ディープリンク契約テスト
 * Run: node scripts/pr-collections-payment-deeplink-test.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const logic = read("lib/queues/collectionQueue.ts");
const page = read("app/queues/collections/page.tsx");
const tabs = read("app/cases/[id]/caseDetailTabs.ts");

assert(
  "unpaid helper + payment secondary resolver exist",
  logic.includes("unpaidActiveInvoicesForCollection") &&
    logic.includes("resolveCollectionPaymentSecondary")
);
assert(
  "single unpaid → payments/new",
  logic.includes("`/invoices/${unpaidInvoices[0].id}/payments/new`") &&
    logic.includes('"入金登録"')
);
assert(
  "multiple unpaid → case invoice tab",
  logic.includes("`/cases/${caseId}?tab=invoice`") &&
    logic.includes('"請求・入金"')
);
assert(
  "zero invoices still create invoice",
  logic.includes("`/cases/${input.id}/invoices/new`") &&
    logic.includes('"請求作成"') &&
    logic.includes('"請求書を作成"')
);
assert(
  "no /payments secondary deep-link",
  !logic.includes('secondaryHref = "/payments"') &&
    !logic.includes('secondaryHref: "/payments"') &&
    !logic.includes('"入金管理"')
);
assert(
  "collections page still renders secondaryHref",
  page.includes("row.secondaryHref") && page.includes("row.secondaryLabel")
);
assert(
  "case detail supports tab=invoice",
  tabs.includes('id: "invoice"') && tabs.includes('"請求・入金"')
);

const porcelain = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout || "";

assert(
  "no forbidden area changes",
  !/supabase\/migrations\//.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/createPaymentPayload/.test(porcelain) &&
    !/app\/api\//.test(porcelain)
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-collection-queue-management-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

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
console.log("\nAll collections payment deeplink checks passed");
