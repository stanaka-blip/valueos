/**
 * PR #80: 案件登録 STEP1 簡素化テスト（本番DB書込なし）
 * 実行: node scripts/pr-case-registration-step1-simplify-test.mjs
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

const step1Src = read("app/components/case-registration/Step1CaseForm.tsx");
const typesSrc = read("app/components/case-registration/types.ts");
const validationSrc = read("app/components/case-registration/validation.ts");
const extrasSrc = read("app/components/case-registration/caseRegistrationExtras.ts");
const printSrc = read("app/orders/[id]/print/page.tsx");

assert(
  "removed fields not in STEP1 UI",
  !step1Src.includes("受注区分") &&
    !step1Src.includes("案件番号") &&
    !step1Src.includes("工事内容") &&
    !/>\s*メモ\s*</.test(step1Src)
);

assert(
  "STEP1 keeps required fields",
  step1Src.includes("販売店") &&
    step1Src.includes("顧客名") &&
    step1Src.includes("お客様電話番号") &&
    step1Src.includes("設置先住所") &&
    step1Src.includes("施工店名") &&
    step1Src.includes("受注日") &&
    step1Src.includes("希望納品日") &&
    step1Src.includes("工事希望日") &&
    step1Src.includes("販売店担当者") &&
    step1Src.includes("納品先は設置先住所と同じ") &&
    step1Src.includes("納品先住所") &&
    step1Src.includes("納品先電話番号") &&
    step1Src.includes("荷受け担当者")
);

assert(
  "case_no always null in gateway body",
  validationSrc.includes("case_no: null") &&
    !validationSrc.includes("caseForm.case_no")
);

assert(
  "new form fields in types",
  typesSrc.includes("contractor_name") &&
    typesSrc.includes("delivery_phone") &&
    !typesSrc.includes("order_type:") &&
    !typesSrc.includes("case_no:")
);

assert(
  "labeled memo/construction_detail serialization",
  extrasSrc.includes("【荷受け電話番号】") &&
    extrasSrc.includes("【荷受け担当者】") &&
    extrasSrc.includes("【施工店名】") &&
    extrasSrc.includes("upsertLabeledMemoFields") &&
    validationSrc.includes("buildCaseRegistrationMemo")
);

assert(
  "delivery same-as-site copies address only",
  validationSrc.includes("resolvedDeliveryAddress") &&
    step1Src.includes("delivery_same_as_site") &&
    !step1Src.includes("customer_phone", step1Src.indexOf("delivery_phone"))
);

assert(
  "print page shows purchase order fields",
  printSrc.includes("納品希望日") &&
    printSrc.includes("お客様電話番号") &&
    printSrc.includes("施工店名") &&
    printSrc.includes("納品先電話番号") &&
    printSrc.includes("desired_delivery_date") &&
    printSrc.includes("parseCaseExtras")
);

assert(
  "print page uses orders.memo for 発注備考",
  printSrc.includes("発注備考") && printSrc.includes("order.memo")
);

assert(
  "no RPC / migration / workflow changes in touched UI paths",
  !step1Src.includes("create_case_registration") &&
    !validationSrc.includes("WorkflowEngine") &&
    !extrasSrc.includes("supabase/migrations")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-registration-step1-simplify-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

const printDoc = spawnSync("node", ["scripts/pr-order-print-document-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (printDoc.status !== 0) {
  process.stdout.write(printDoc.stdout || "");
  process.stderr.write(printDoc.stderr || "");
}
assert("print document regression", printDoc.status === 0, `status=${printDoc.status}`);

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
console.log("\nall case registration step1 simplify checks passed");
