/**
 * PR-C: 案件詳細 商品追加UI統一 テスト（本番DB書込なし）
 * 実行: node scripts/pr-case-detail-product-add-ui-test.mjs
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

const pageSrc = read("app/cases/[id]/products/new/page.tsx");
const submitSrc = read("app/cases/[id]/submitCaseLine.ts");
const detailPageSrc = read("app/cases/[id]/page.tsx");
const detailViewSrc = read("app/cases/[id]/CaseDetailView.tsx");
const tabsSrc = read("app/cases/[id]/caseDetailTabs.ts");

assert(
  "page removes anon case_products insert",
  !pageSrc.includes('from("case_products")') &&
    !pageSrc.includes("case_products") &&
    !pageSrc.includes(".insert(")
);
assert(
  "page does not import supabase client for writes",
  !pageSrc.includes('@/lib/supabase') && !pageSrc.includes('from "supabase"')
);
assert(
  "page does not collect supplier / prices / profit",
  !pageSrc.includes("supplier") &&
    !pageSrc.includes("purchase_price") &&
    !pageSrc.includes("sales_price") &&
    !pageSrc.includes("gross_profit") &&
    !pageSrc.includes("仕入先") &&
    !pageSrc.includes("仕入価格") &&
    !pageSrc.includes("販売価格") &&
    !pageSrc.includes("粗利")
);
assert(
  "page selects PRODUCT / PACKAGE + quantity",
  pageSrc.includes('value="PRODUCT"') &&
    pageSrc.includes('value="PACKAGE"') &&
    pageSrc.includes("数量")
);
assert(
  "page reuses STEP2 masters + validateStep2",
  pageSrc.includes("fetchActiveProducts") &&
    pageSrc.includes("fetchActivePackages") &&
    pageSrc.includes("validateStep2")
);
assert(
  "page uses submitCaseLine + idempotency reuse",
  pageSrc.includes("submitCaseLine") &&
    pageSrc.includes("ensureIdempotencyKey") &&
    pageSrc.includes("caseLineFingerprint")
);
assert(
  "page disables submit while sending",
  pageSrc.includes("disabled={submitting}") && pageSrc.includes("追加中")
);
assert(
  "page returns to products tab on success",
  pageSrc.includes("`/cases/${caseId}?tab=products`") ||
    pageSrc.includes("/cases/${caseId}?tab=products")
);
assert(
  "page keeps input on failure (sets error, unlocks for retry)",
  pageSrc.includes("setSubmitError(submitResult.error_message)") &&
    pageSrc.includes("setSubmitting(false)") &&
    !pageSrc.includes("setQuantity(\"\")")
);

assert(
  "submit goes CSRF then lines API with Idempotency-Key",
  submitSrc.includes('fetch("/api/auth/csrf"') &&
    submitSrc.includes("`/api/cases/${options.caseId}/lines`") &&
    submitSrc.includes('"X-CSRF-Token"') &&
    submitSrc.includes('"Idempotency-Key"')
);
assert(
  "submit body has no case_id / prices / supplier",
  !submitSrc.includes("case_id:") &&
    !submitSrc.includes("sales_price") &&
    !submitSrc.includes("purchase_price") &&
    !submitSrc.includes("supplier_id") &&
    !submitSrc.includes("is_manual_price")
);
assert(
  "submit maps PACKAGE_ITEMS_NOT_FOUND safely",
  submitSrc.includes("PACKAGE_ITEMS_NOT_FOUND") &&
    submitSrc.includes("パッケージ構成が見つかりません")
);

assert(
  "detail page passes ?tab= to initialTab",
  detailPageSrc.includes("searchParams") &&
    detailPageSrc.includes("resolveCaseDetailTabId") &&
    detailPageSrc.includes("initialTab=")
);
assert(
  "CaseDetailView accepts initialTab",
  detailViewSrc.includes("initialTab") &&
    detailViewSrc.includes('useState<CaseDetailTabId>(initialTab)')
);
assert(
  "tab helper includes products",
  tabsSrc.includes('"products"') && tabsSrc.includes("resolveCaseDetailTabId")
);

// dealer / registration wizard / migration untouched by path checks
assert(
  "product add page does not touch dealer paths",
  !pageSrc.includes("app/dealer") && !pageSrc.includes("/dealer/")
);
assert(
  "submit does not call create_case_registration",
  !submitSrc.includes("create_case_registration") &&
    !pageSrc.includes("create_case_registration")
);

const dealerDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main...HEAD", "--", "app/dealer"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no dealer file diffs vs main",
  (dealerDiff.stdout || "").trim() === "",
  dealerDiff.stdout
);

const migDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main...HEAD", "--", "supabase/migrations"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no migration diffs vs main",
  (migDiff.stdout || "").trim() === "",
  migDiff.stdout
);

const wizardDiff = spawnSync(
  "git",
  [
    "diff",
    "--name-only",
    "origin/main...HEAD",
    "--",
    "app/components/case-registration/CaseRegistrationWizard.tsx",
    "app/components/case-registration/Step2LinesForm.tsx",
  ],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "registration wizard / STEP2 form unchanged",
  (wizardDiff.stdout || "").trim() === "",
  wizardDiff.stdout
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-detail-product-add-ui-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll checks passed");
