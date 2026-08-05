/**
 * 案件詳細 決済UI統一 テスト（本番DB書込なし）
 * 実行: node scripts/pr-case-detail-settlement-ui-test.mjs
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

const viewSrc = read("app/cases/[id]/settlementView.ts");
const formSrc = read("app/cases/[id]/SettlementForm.tsx");
const detailSrc = read("app/cases/[id]/CaseDetailView.tsx");
const workflowSrc = read("app/cases/[id]/WorkflowPanel.tsx");
const typesSrc = read("lib/caseSettlementTypes.ts");

assert(
  "view maps finance_company / approval_number",
  viewSrc.includes("financeCompany: row.finance_company") &&
    viewSrc.includes("approvalNumber: row.approval_number")
);
assert(
  "view has resolveSettlementDetailColumns + validate",
  viewSrc.includes("export function resolveSettlementDetailColumns") &&
    viewSrc.includes("export function validateSettlementDetailFields")
);
assert(
  "view documents その他 preserve policy",
  viewSrc.includes("その他") && viewSrc.includes("既存値を維持")
);

assert(
  "form uses CASE_SETTLEMENT_TYPES (includes その他)",
  formSrc.includes("CASE_SETTLEMENT_TYPES") &&
    typesSrc.includes('"その他"')
);
assert(
  "form shows 信販会社 / 承認番号 for 3社間",
  formSrc.includes("信販会社") &&
    formSrc.includes("承認番号") &&
    formSrc.includes('settlementType === "3社間決済"')
);
assert(
  "form shows カード会社名 for カード",
  formSrc.includes("カード会社名") &&
    formSrc.includes('settlementType === "カード"')
);
assert(
  "form does not always show card brand field",
  !formSrc.includes("カードブランド")
);
assert(
  "form upserts detail columns via resolveSettlementDetailColumns",
  formSrc.includes("resolveSettlementDetailColumns") &&
    formSrc.includes("...detailColumns")
);
assert(
  "form validates detail fields before save",
  formSrc.includes("validateSettlementDetailFields")
);
assert(
  "form preserves loan/card status on save",
  formSrc.includes("loan_status: settlement?.loanStatus") &&
    formSrc.includes("card_status: settlement?.cardStatus")
);

assert(
  "SettlementTab conditional 信販会社 / カード会社名",
  detailSrc.includes('label="信販会社"') &&
    detailSrc.includes('label="カード会社名"') &&
    detailSrc.includes('type === "3社間決済"') &&
    detailSrc.includes('type === "カード"')
);
assert(
  "SettlementTab does not label カードブランド",
  !detailSrc.includes('label="カードブランド"')
);

assert(
  "WorkflowPanel uses settlement-type field visibility",
  workflowSrc.includes("resolveWorkflowPanelFieldVisibility") &&
    workflowSrc.includes("buildWorkflowPanelSaveBody") &&
    workflowSrc.includes("visibility.showLoanStatus") &&
    workflowSrc.includes("visibility.showCardStatus") &&
    workflowSrc.includes("resolveLatestConfirmedPaymentDate") &&
    workflowSrc.includes("resolveLatestOrderDeliveryDate")
);

// dealer / registration / migration untouched
assert(
  "no dealer settlement form edits in this PR scope files",
  !formSrc.includes("app/dealer") && !viewSrc.includes("app/dealer")
);
assert(
  "case detail settlement files do not call registration RPC",
  !formSrc.includes("create_case_registration") &&
    !viewSrc.includes("create_case_registration") &&
    !workflowSrc.includes("create_case_registration")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-detail-settlement-ui-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll case-detail settlement UI checks passed");
