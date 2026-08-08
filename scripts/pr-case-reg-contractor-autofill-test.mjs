/**
 * 案件登録 STEP1 施工店マスタ連携（本番DB書込なし）
 * 実行: node scripts/pr-case-reg-contractor-autofill-test.mjs
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
const wizardSrc = read(
  "app/components/case-registration/CaseRegistrationWizard.tsx"
);
const mastersSrc = read("app/components/case-registration/masters.ts");
const applySrc = read(
  "app/components/case-registration/applyContractorToCaseForm.ts"
);
const typesSrc = read("app/components/case-registration/types.ts");
const validationSrc = read("app/components/case-registration/validation.ts");
const extrasSrc = read(
  "app/components/case-registration/caseRegistrationExtras.ts"
);
const confirmSrc = read(
  "app/components/case-registration/Step4ConfirmForm.tsx"
);

assert(
  "active contractors fetch exists",
  mastersSrc.includes("fetchActiveContractors") &&
    mastersSrc.includes('from("contractors")') &&
    mastersSrc.includes("isActiveFlag(c.is_active)")
);

assert(
  "wizard loads contractors for STEP1",
  wizardSrc.includes("fetchActiveContractors") &&
    wizardSrc.includes("contractors={contractors}")
);

assert(
  "STEP1 has master dropdown + editable snapshot fields",
  step1Src.includes("施工店（マスタから選択）") &&
    step1Src.includes("applyContractorToCaseForm") &&
    step1Src.includes("delivery_name") &&
    step1Src.includes("contractor_name") &&
    step1Src.includes("delivery_address") &&
    step1Src.includes("delivery_phone") &&
    step1Src.includes("receiver_name") &&
    step1Src.includes("手入力する")
);

assert(
  "apply helper copies delivery fields, not site address",
  applySrc.includes("delivery_name") &&
    applySrc.includes("delivery_address") &&
    applySrc.includes("delivery_phone") &&
    applySrc.includes("receiver_name") &&
    applySrc.includes("delivery_same_as_site: false") &&
    !applySrc.includes("site_address:")
);

assert(
  "no cases.contractor_id in registration path",
  !typesSrc.includes("contractor_id") &&
    !validationSrc.includes("contractor_id") &&
    !step1Src.includes("contractor_id") &&
    !wizardSrc.includes("contractor_id")
);

assert(
  "memo snapshot includes 納品先名称 via existing path",
  extrasSrc.includes("納品先名称") &&
    validationSrc.includes("delivery_name: caseForm.delivery_name") &&
    validationSrc.includes("buildCaseRegistrationMemo") &&
    validationSrc.includes("buildCaseRegistrationConstructionDetail")
);

assert(
  "STEP4 shows delivery_name",
  confirmSrc.includes("納品先名称") && confirmSrc.includes("delivery_name")
);

assert(
  "dealer flow untouched by this change set",
  !read("app/dealer/orders/new/page.tsx").includes("fetchActiveContractors") &&
    !read("app/dealer/orders/new/page.tsx").includes(
      "applyContractorToCaseForm"
    )
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-reg-contractor-autofill-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("autofill behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

const step1Behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-registration-step1-simplify-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(step1Behavior.stdout || "");
process.stderr.write(step1Behavior.stderr || "");
assert(
  "step1 simplify behavior regression",
  step1Behavior.status === 0,
  `status=${step1Behavior.status}`
);

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
console.log("\nall case registration contractor autofill checks passed");
