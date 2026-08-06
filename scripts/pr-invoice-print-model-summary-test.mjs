/**
 * PR #86: 請求書摘要を型番表示へ
 * Run: node scripts/pr-invoice-print-model-summary-test.mjs
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

const page = read("app/invoices/[id]/print/page.tsx");
const summary = read("app/cases/caseListLineSummary.ts");

assert(
  "reuses summarizeCaseModelNumbers",
  page.includes('from "@/app/cases/caseListLineSummary"') &&
    page.includes("summarizeCaseModelNumbers")
);

assert(
  "loads PRODUCT model_no and PACKAGE model_no_snapshot",
  page.includes("model_no_snapshot") &&
    page.includes("products (\n        model_no") &&
    page.includes("case_package_items")
);

assert(
  "does not hardcode 案件請求",
  !page.includes("案件請求")
);

assert(
  "does not use product/package name as summary",
  page.includes("商品名・パッケージ名にはフォールバックしない") &&
    !/packages\s*\(\s*\n?\s*name/.test(page)
);

assert(
  "empty model shows em dash via shared helper",
  summary.includes('emptyLabel = "—"') ||
    read("app/cases/formatFirstAndOthers.ts").includes('emptyLabel = "—"')
);

assert(
  "multi-model uses first + 他N件 formatter",
  summary.includes("formatFirstAndOthers") &&
    page.includes("order-print-summary") &&
    page.includes("white-space: pre-line")
);

assert(
  "keeps invoice_amount as formal amount",
  page.includes("invoices.invoice_amount を正式値") &&
    /\{formatYen\(invoiceAmount\)\}/.test(page)
);

const behavior = spawnSync(
  "npx",
  ["tsx", "--test", "app/cases/formatFirstAndOthers.test.ts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("shared model summary unit tests", behavior.status === 0);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
const porcelain = status.stdout || "";
assert(
  "no migration / rpc / workflow / dealer changes",
  !/supabase\/migrations\//.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain)
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll invoice print model summary checks passed");
