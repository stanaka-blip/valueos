/**
 * PR96: 回収管理オペレーションUI契約テスト
 * Run: node scripts/pr-collections-ops-ui-test.mjs
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
const client = read("app/queues/collections/CollectionsQueueClient.tsx");

assert(
  "presentation helpers exist",
  logic.includes("resolveCollectionUiCategory") &&
    logic.includes("buildCollectionQueueSummary") &&
    logic.includes("resolveCollectionInvoiceMoney") &&
    logic.includes("resolveCollectionCtaLabel")
);
assert(
  "PR95 payment secondary resolver intact",
  logic.includes("resolveCollectionPaymentSecondary") &&
    logic.includes("`/invoices/${unpaidInvoices[0].id}/payments/new`") &&
    logic.includes("`/cases/${caseId}?tab=invoice`")
);
assert(
  "exclusion helpers intact",
  logic.includes("isAdvancePaymentComplete") &&
    logic.includes("areAllOrdersDelivered") &&
    logic.includes("isCardSettlementComplete") &&
    logic.includes("isLoanApprovalComplete")
);
assert(
  "page loads queue and client",
  page.includes("loadCollectionQueue") &&
    page.includes("CollectionsQueueClient")
);
assert(
  "summary labels present",
  client.includes("請求待ち") &&
    client.includes("入金待ち") &&
    client.includes("一部入金") &&
    client.includes("期限超過") &&
    client.includes("決済・審査待ち")
);
assert(
  "filter buttons present",
  client.includes("すべて") &&
    client.includes('key: "invoice_pending"') &&
    client.includes('key: "settlement_review"')
);
assert(
  "recommended columns present",
  client.includes(">状態<") &&
    client.includes(">案件番号<") &&
    client.includes(">顧客名<") &&
    client.includes(">販売店<") &&
    client.includes(">決済条件<") &&
    client.includes(">請求額<") &&
    client.includes(">入金済額<") &&
    client.includes(">残額<") &&
    client.includes(">支払期限<") &&
    client.includes(">次の対応<")
);
assert(
  "CTA uses ctaLabel with secondaryHref",
  client.includes("row.ctaLabel") && client.includes("row.secondaryHref")
);

const porcelain =
  spawnSync("git", ["status", "--porcelain"], {
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

const deeplink = spawnSync(
  "npx",
  [
    "tsx",
    "-e",
    `
import assert from 'node:assert/strict';
import { buildCollectionQueueRow } from './lib/queues/collectionQueue.ts';
const base = {
  id: 'c1', case_no: 'VE-1', status: '受付済', customer_name: '顧客',
  order_received_date: '2026-07-01', dealer_name: '販売店',
  deposit_amount: null, loan_status: null, card_status: null, approval_number: null,
  orders: [{ id: 'o1', status: '納品済', delivered_date: '2026-07-10' }],
  invoices: [], payments: [], today: '2026-08-05', settlement_type: '売掛',
};
const one = buildCollectionQueueRow({
  ...base,
  invoices: [{ id: 'i1', status: '請求済', invoice_amount: 100000, due_date: '2026-08-31' }],
});
assert.equal(one.secondaryHref, '/invoices/i1/payments/new');
assert.equal(one.secondaryLabel, '入金登録');
const many = buildCollectionQueueRow({
  ...base,
  invoices: [
    { id: 'i1', status: '請求済', invoice_amount: 100000, due_date: '2026-08-31' },
    { id: 'i2', status: '請求済', invoice_amount: 80000, due_date: '2026-09-30' },
  ],
});
assert.equal(many.secondaryHref, '/cases/c1?tab=invoice');
assert.equal(many.secondaryLabel, '請求・入金');
console.log('OK PR95 deeplink preserved');
`,
  ],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(deeplink.stdout || "");
process.stderr.write(deeplink.stderr || "");
assert("PR95 deeplink preserved", deeplink.status === 0, `status=${deeplink.status}`);

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
console.log("\nAll collections ops UI checks passed");
