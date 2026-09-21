/**
 * 案件登録4ステップUI テスト（本番DB書込なし）
 * 実行: node scripts/pr3-case-registration-ui-test.mjs
 * 振る舞い検証は tsx サブプロセスで path alias 付き import する。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ---------- static checks ----------
const uiDir = join(ROOT, "app/components/case-registration");
assert("case-registration dir exists", existsSync(uiDir));

const uiFiles = walk(uiDir).filter((p) => /\.(ts|tsx)$/.test(p));
const uiBundle = uiFiles.map((p) => readFileSync(p, "utf8")).join("\n");
const pageSrc = read("app/cases/new/page.tsx");
const wizardSrc = read("app/components/case-registration/CaseRegistrationWizard.tsx");
const submitSrc = read("app/components/case-registration/submitCaseRegistration.ts");
const step2Src = read("app/components/case-registration/Step2LinesForm.tsx");
const step1Src = read("app/components/case-registration/Step1CaseForm.tsx");
const step3Src = read("app/components/case-registration/Step3SettlementForm.tsx");
const step4Src = read("app/components/case-registration/Step4ConfirmForm.tsx");
const validationSrc = read("app/components/case-registration/validation.ts");
const typesSrc = read("app/components/case-registration/types.ts");
const commonSettlementTypesSrc = read("lib/caseSettlementTypes.ts");
const mastersSrc = read("app/components/case-registration/masters.ts");

assert("1 page uses wizard", pageSrc.includes("CaseRegistrationWizard"));
assert(
  "13 no anon cases.insert in new page or UI",
  !pageSrc.includes('.from("cases").insert') &&
    !uiBundle.includes('.from("cases").insert') &&
    !uiBundle.includes(".from('cases').insert")
);
assert(
  "13 no multi-stage client insert cleanup",
  !uiBundle.includes("case_products") || !uiBundle.includes(".insert(")
);
assert(
  "no department/priority in payload builders",
  !validationSrc.includes("department") && !validationSrc.includes("priority")
);
assert("no department/priority fields in types", !typesSrc.includes("department") && !typesSrc.includes("priority"));
assert("STEP1 required dealer/customer/site/order date", /販売店/.test(step1Src) && /顧客名/.test(step1Src) && /設置先住所/.test(step1Src) && /受注日/.test(step1Src));
assert("STEP1 phone optional (no required marker on phone)", !/電話番号[\s\S]{0,80}\*/.test(step1Src));
assert("STEP1 delivery conditional", step1Src.includes("delivery_same_as_site") && step1Src.includes("納品先住所"));
assert("STEP2 PRODUCT/PACKAGE", step2Src.includes('value="PRODUCT"') && step2Src.includes('value="PACKAGE"'));
assert("STEP2 has qty + supplier + purchase price", step2Src.includes("数量") && step2Src.includes("標準仕入先") && step2Src.includes("仕入単価") && step2Src.includes("販売単価"));
assert("STEP2 supplier select UI", step2Src.includes('仕入先を選択') && step2Src.includes("SupplierOption"));
assert("STEP2 resolves default supplier", step2Src.includes("resolveDefaultSupplierId") || step2Src.includes("buildProductLinePatch"));
assert("STEP2 qty input bounds", step2Src.includes("min={1}") && step2Src.includes("max={9999}") && step2Src.includes("step={1}"));
assert("STEP2 qty validate message", validationSrc.includes("数量は1〜9,999の整数で入力してください"));
assert("resolveDefaultSupplier module exists", existsSync(join(uiDir, "resolveDefaultSupplier.ts")));
assert(
  "masters fetch default_supplier_id",
  mastersSrc.includes("default_supplier_id") &&
    mastersSrc.includes("default_supplier_id")
);
assert(
  "wizard fetches suppliers for display",
  wizardSrc.includes("fetchActiveSuppliers") && wizardSrc.includes("suppliers=")
);
assert("supplier required error", validationSrc.includes("仕入先を選択してください"));
assert("wizard enforces supplier on STEP2", wizardSrc.includes("enforceDefaultSupplier: true"));
assert("gateway body includes supplier_id", validationSrc.includes("supplier_id: line.supplier_id"));
assert("gateway body includes price fields", validationSrc.includes("purchase_price") && validationSrc.includes("sales_price"));
assert("LineDraft has supplier_id and price fields", typesSrc.includes("supplier_id") && typesSrc.includes("purchase_price") && typesSrc.includes("sales_price"));
assert(
  "STEP4 shows qty/supplier/prices",
  step4Src.includes("数量") &&
    step4Src.includes("suppliers") &&
    step4Src.includes("販売単価") &&
    step4Src.includes("仕入単価")
);
assert(
  "case registration UI shows supplier on STEP2 only (not STEP1/3)",
  step2Src.includes("仕入単価") &&
    !step1Src.includes("仕入先") &&
    !step3Src.includes("仕入先") &&
    !step3Src.includes("仕入単価")
);
assert("wizard has draft save", wizardSrc.includes("下書き保存") && wizardSrc.includes("saveCaseRegistrationDraft"));
assert("draft API route exists", existsSync(join(ROOT, "app/api/case-registration-drafts/route.ts")));
assert("draft migration exists", existsSync(join(ROOT, "supabase/migrations/20260921120000_case_registration_drafts.sql")));
assert("snapshot migration exists", existsSync(join(ROOT, "supabase/migrations/20260921121000_case_registration_supplier_price_snapshot.sql")));
assert("snapshot RPC allows line manual price", (() => {
  const sql = read("supabase/migrations/20260921121000_case_registration_supplier_price_snapshot.sql");
  return (
    !sql.includes("IF COALESCE((v_line->>'is_manual_price')::boolean, false) THEN") &&
    sql.includes("round(v_unit_purchase * v_quantity)") &&
    !sql.includes("supplier/価格は登録時NULL")
  );
})());
assert("PACKAGE purchase fallback helper exists", (() => {
  const src = read("lib/purchasePrices.ts");
  return src.includes("fetchActivePackagePurchaseUnitPriceWithFallback");
})());
assert("wizard resumes inactive packages", wizardSrc.includes("inactivePackageIds") && wizardSrc.includes("packages"));
assert("gateway rejects inactive packages", (() => {
  const src = read("app/api/case-registrations/route.ts");
  return (
    src.includes("assertNewPackageSelectionsActive") &&
    src.includes("PACKAGE_INACTIVE_SELECT_MESSAGE")
  );
})());
assert("dealer change refreshes sales prices", wizardSrc.includes("dealer_id !== prevDealerId") || wizardSrc.includes("next.dealer_id !== prevDealerId"));
assert("resolveDefaultSupplier does not use dealers/purchase_prices", (() => {
  const src = read("app/components/case-registration/resolveDefaultSupplier.ts");
  return !src.includes("dealers") && !src.includes("purchase_prices");
})());
assert("12 line cards UI", step2Src.includes("明細を追加") && step2Src.includes("rounded-lg border"));
assert(
  "STEP3 formal settlement options only",
  step3Src.includes("SETTLEMENT_TYPES") &&
    typesSrc.includes("CASE_REGISTRATION_SETTLEMENT_TYPES") &&
    ["前金", "売掛", "3社間決済", "カード"].every((t) =>
      commonSettlementTypesSrc.includes(`"${t}"`)
    ) &&
    commonSettlementTypesSrc.includes("CASE_REGISTRATION_SETTLEMENT_TYPES") &&
    !typesSrc.includes("掛売") &&
    !typesSrc.includes("ローン") &&
    !typesSrc.includes("現金") &&
    !typesSrc.includes('"その他"')
);
assert("STEP3 requires finance fields for 3社間", step3Src.includes("信販会社") && step3Src.includes("承認番号"));
assert("STEP3 requires card company name", step3Src.includes("カード会社名"));
assert(
  "STEP3 payload fields in validation",
  validationSrc.includes("finance_company") &&
    validationSrc.includes("approval_number") &&
    validationSrc.includes("card_brand") &&
    validationSrc.includes("buildSettlementPayload")
);
assert("STEP4 shows settlement", step4Src.includes("決済区分"));
assert("STEP4 shows finance details", step4Src.includes("信販会社") && step4Src.includes("承認番号"));
assert("STEP4 shows card company name", step4Src.includes("カード会社名"));
assert("8 double submit guard", wizardSrc.includes("if (submitting || uploadingAttachments || createdCaseId) return") && step4Src.includes("disabled={busy}"));
assert("8 keep submitting on success", wizardSrc.includes("成功後に下書き削除") || wizardSrc.includes("成功後は submitting を解除せず") || wizardSrc.includes("setCreatedCaseId"));
assert("9 idempotency fingerprint", wizardSrc.includes("registrationFingerprint") && wizardSrc.includes("idempotencyKeyRef"));
assert("7 CSRF then gateway", submitSrc.includes('/api/auth/csrf') && submitSrc.includes("/api/case-registrations"));
assert("7 X-CSRF-Token header", submitSrc.includes("X-CSRF-Token"));
assert("7 Idempotency-Key header", submitSrc.includes("Idempotency-Key"));
assert("7 credentials same-origin", submitSrc.includes('credentials: "same-origin"'));
assert("7 no manual Origin header", !/["']Origin["']\s*:/.test(submitSrc) && !submitSrc.includes("headers.Origin"));
assert("10 success navigates /cases/{id}", wizardSrc.includes("`/cases/${caseId}?tab=documents`") || wizardSrc.includes("/cases/${caseId}"));
assert("11 safe error helper used", submitSrc.includes("safeUserErrorMessage"));
assert("14 no service role in client UI", !/SERVICE_ROLE|service_role|serviceRole/.test(uiBundle));
assert("no createCaseRegistration direct RPC from wizard", !wizardSrc.includes("createCaseRegistration("));
assert("line price resolve helper exists", existsSync(join(uiDir, "linePriceResolve.ts")));

// dealer diff
const dealerDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", "app/dealer"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("15 dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

// ⑦ allows draft/snapshot migrations + case-registration-drafts API + createCaseRegistration type update
const migDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "supabase/migrations", "lib/gateway", "lib/cases", "proxy.ts", "app/api"],
  { cwd: ROOT, encoding: "utf8" }
);
const migFiles = (migDiff.stdout || "")
  .trim()
  .split("\n")
  .filter(Boolean);
const allowedMig = migFiles.every(
  (f) =>
    f.includes("case_registration_drafts") ||
    f.includes("case_registration_supplier_price_snapshot") ||
    f.includes("case-registration-drafts") ||
    f.includes("case-registrations") ||
    f.includes("lib/cases/createCaseRegistration.ts") ||
    f.includes("lib/caseRegistrationDrafts/")
);
assert(
  "migration/api changes limited to ⑦ drafts+snapshot",
  migFiles.length === 0 || allowedMig,
  migDiff.stdout
);

const orderDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "app/orders", "app/invoices", "app/payments"],
  { cwd: ROOT, encoding: "utf8" }
);
assert("no order/invoice/payment changes", (orderDiff.stdout || "").trim() === "", orderDiff.stdout);

const caseDetailDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "app/cases/[id]", "lib/caseSettlementTypes.ts"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no case detail UI / shared settlement types edits",
  (caseDetailDiff.stdout || "").trim() === "",
  caseDetailDiff.stdout
);

// ---------- behavioral (tsx) ----------
const behaviorFile = join(ROOT, "scripts/pr3-case-registration-ui-behavior.mts");
const beh = spawnSync("npx", ["tsx", behaviorFile], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
process.stdout.write(beh.stdout || "");
process.stderr.write(beh.stderr || "");
if (beh.status !== 0) {
  failed += 1;
  console.error("FAIL behavioral suite exit", beh.status);
}

// client bundle service role check (after build artifact if present; else source-level already done)
const nextDir = join(ROOT, ".next");
if (existsSync(nextDir)) {
  const chunks = [];
  function collect(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try {
        if (statSync(p).isDirectory()) {
          if (name === "cache" || name === "server") continue;
          collect(p);
        } else if (/\.(js|css)$/.test(name)) chunks.push(p);
      } catch {
        /* ignore */
      }
    }
  }
  collect(join(nextDir, "static"));
  let leaked = false;
  for (const p of chunks) {
    const txt = readFileSync(p, "utf8");
    if (/SERVICE_ROLE_KEY|service_role/.test(txt) && /eyJ|supabase/i.test(txt)) {
      leaked = true;
      console.error("potential leak in", p);
      break;
    }
  }
  assert("14 client static chunks no service role key pattern", !leaked);
} else {
  console.log("SKIP 14 bundle scan (.next missing; run after build)");
}

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL PR3 UI TESTS PASSED");
