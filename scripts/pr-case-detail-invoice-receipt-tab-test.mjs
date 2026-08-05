/**
 * PR #79: 案件詳細 請求・入金タブ統合テスト（本番DB書込なし）
 * 実行: node scripts/pr-case-detail-invoice-receipt-tab-test.mjs
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

const tabsSrc = read("app/cases/[id]/caseDetailTabs.ts");
const viewSrc = read("app/cases/[id]/CaseDetailView.tsx");
const pageSrc = read("app/cases/[id]/page.tsx");

assert(
  'tab label is "請求・入金"',
  tabsSrc.includes('{ id: "invoice", label: "請求・入金" }')
);
assert(
  "standalone receipt tab removed from CASE_DETAIL_TABS",
  !tabsSrc.includes('{ id: "receipt", label: "入金" }')
);
assert(
  "receipt tab id removed from CaseDetailTabId union",
  !tabsSrc.includes('| "receipt"')
);
assert(
  "legacy ?tab=receipt resolves to invoice",
  tabsSrc.includes('value === "receipt"') &&
    tabsSrc.includes('return "invoice"')
);

assert(
  "merged InvoiceReceiptTab renders on invoice tab",
  viewSrc.includes("function InvoiceReceiptTab") &&
    viewSrc.includes("<InvoiceReceiptTab") &&
    viewSrc.includes('tab === "invoice"')
);
assert(
  "standalone invoice/receipt tabs removed",
  !viewSrc.includes("function InvoiceTab") &&
    !viewSrc.includes("function ReceiptTab") &&
    !viewSrc.includes('tab === "receipt"')
);

assert(
  "invoice list fields preserved in merged tab",
  viewSrc.includes('label="請求番号"') &&
    viewSrc.includes('label="請求日"') &&
    viewSrc.includes('label="支払期限"') &&
    viewSrc.includes('label="請求金額"') &&
    viewSrc.includes("<InvoiceStatusBadge")
);
assert(
  "payment history fields preserved in merged tab",
  viewSrc.includes('label="入金日"') &&
    viewSrc.includes('label="入金金額"') &&
    viewSrc.includes("<PaymentStatusBadge")
);

assert(
  "invoice create link preserved",
  viewSrc.includes("`/cases/${caseId}/invoices/new`")
);
assert(
  "invoice detail and print links preserved",
  viewSrc.includes("`/invoices/${invoice.id}`") &&
    viewSrc.includes("`/invoices/${invoice.id}/print`")
);
assert(
  "payment registration links preserved",
  viewSrc.includes("`/invoices/${invoice.id}/payments/new`") &&
    viewSrc.includes("`/invoices/${openInvoice.id}/payments/new`")
);

assert(
  "case-level totals reused for amount display",
  viewSrc.includes("totals.invoiceAmount") &&
    viewSrc.includes("totals.paidIn") &&
    viewSrc.includes("totals.unpaid") &&
    viewSrc.includes("invoiceAmount - paidIn")
);

assert(
  "no DB / migration / API / RPC / workflow / dealer changes in touched paths",
  !tabsSrc.includes("supabase/migrations") &&
    !viewSrc.includes("WorkflowEngine") &&
    !pageSrc.includes("create_case_registration")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-detail-invoice-receipt-tab-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(tsc.stdout || "");
process.stderr.write(tsc.stderr || "");
assert("tsc --noEmit", tsc.status === 0, `status=${tsc.status}`);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, CI: "true" },
});
if (build.status !== 0) {
  process.stdout.write(build.stdout || "");
  process.stderr.write(build.stderr || "");
}
assert("npm run build", build.status === 0, `status=${build.status}`);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall invoice-receipt tab checks passed");
