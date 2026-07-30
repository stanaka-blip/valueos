/**
 * PR3 案件登録4ステップUI テスト（本番DB書込なし）
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
assert("STEP2 qty + prices displayed", step2Src.includes("数量") && step2Src.includes("販売単価") && step2Src.includes("仕入単価") && step2Src.includes("粗利"));
assert("STEP2 qty input bounds", step2Src.includes("min={1}") && step2Src.includes("max={9999}") && step2Src.includes("step={1}"));
assert("STEP2 qty validate message", validationSrc.includes("数量は1〜9,999の整数で入力してください"));
assert("STEP2 no manual price UI", !/手動価格|is_manual_price|isManualPrice/.test(step2Src));
assert("PR-C STEP2 no supplier select", !/name=["']supplier_id["']/.test(step2Src) && !step2Src.includes("onChangeLine(line.local_id, { supplier_id"));
assert("PR-C resolveDefaultSupplierId used", step2Src.includes("resolveDefaultSupplierId") && read("app/components/case-registration/resolveDefaultSupplier.ts").includes("resolveDefaultSupplierId"));
assert(
  "PR-C products/packages default_supplier_id fetched",
  read("app/components/case-registration/masters.ts").includes("default_supplier_id") &&
    read("app/components/case-registration/masters.ts").includes('.select("id, name, model_no, is_active, default_supplier_id")') &&
    read("app/components/case-registration/masters.ts").includes('.select("id, name, package_code, is_active, default_supplier_id")')
);
assert(
  "PR-C no dealer default_supplier for lines",
  !wizardSrc.includes("dealer?.default_supplier_id") &&
    !wizardSrc.includes("defaultSupplier") &&
    !/dealers\.find[\s\S]{0,80}default_supplier_id/.test(wizardSrc)
);
assert(
  "PR-C missing default supplier JP error",
  validationSrc.includes("標準仕入先が設定されていません")
);
assert("PR-C STEP4 shows auto supplier", step4Src.includes("仕入先") && step4Src.includes("supplier_id"));
assert("12 PC table / SP cards", step2Src.includes("hidden") && step2Src.includes("md:block") && step2Src.includes("md:hidden"));
assert(
  "STEP3 settlement options",
  step3Src.includes("SETTLEMENT_TYPES") &&
    ["掛売", "ローン", "現金", "カード", "その他"].every((t) => typesSrc.includes(t))
);
assert("STEP4 confirm totals", step4Src.includes("販売合計") && step4Src.includes("粗利合計") && step4Src.includes("決済区分"));
assert("8 double submit guard", wizardSrc.includes("if (submitting) return") && step4Src.includes("disabled={submitting}"));
assert("8 keep submitting on success", wizardSrc.includes("成功後は submitting を解除せず"));
assert("9 idempotency fingerprint", wizardSrc.includes("registrationFingerprint") && wizardSrc.includes("idempotencyKeyRef"));
assert("7 CSRF then gateway", submitSrc.includes('/api/auth/csrf') && submitSrc.includes("/api/case-registrations"));
assert("7 X-CSRF-Token header", submitSrc.includes("X-CSRF-Token"));
assert("7 Idempotency-Key header", submitSrc.includes("Idempotency-Key"));
assert("7 credentials same-origin", submitSrc.includes('credentials: "same-origin"'));
assert("7 no manual Origin header", !/["']Origin["']\s*:/.test(submitSrc) && !submitSrc.includes("headers.Origin"));
assert("10 success navigates /cases/{id}", wizardSrc.includes("`/cases/${result.case_id}`") || wizardSrc.includes("/cases/${result.case_id}"));
assert("11 safe error helper used", submitSrc.includes("safeUserErrorMessage"));
assert("14 no service role in client UI", !/SERVICE_ROLE|service_role|serviceRole/.test(uiBundle));
assert("no createCaseRegistration direct RPC from wizard", !wizardSrc.includes("createCaseRegistration"));
assert("price refresh on dealer/date/qty", wizardSrc.includes("refreshLinePrices") && wizardSrc.includes("order_received_date"));
assert("validate blocks missing price", validationSrc.includes("販売単価が取得できません") && validationSrc.includes("仕入単価が取得できません"));

// dealer diff
const dealerDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", "app/dealer"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("15 dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

// migration / supabase privilege changes should be empty for PR3 scope (warn via assert on tracked paths)
const migDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "supabase/migrations", "lib/gateway", "proxy.ts"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no migration/gateway/proxy changes in working tree vs main",
  (migDiff.stdout || "").trim() === "",
  migDiff.stdout
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
