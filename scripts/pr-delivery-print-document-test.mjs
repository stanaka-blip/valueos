/**
 * PR #82: 納品書印刷帳票テスト（本番DB書込なし）
 * 実行: node scripts/pr-delivery-print-document-test.mjs
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

const page = read("app/orders/[id]/delivery-print/page.tsx");
const orderPage = read("app/orders/[id]/page.tsx");
const orderPrint = read("app/orders/[id]/print/page.tsx");
const step1Src = read("app/components/case-registration/Step1CaseForm.tsx");
const extrasSrc = read("app/components/case-registration/caseRegistrationExtras.ts");

assert("delivery-print route exists", page.includes("DeliveryPrintPage"));
assert(
  "order detail has delivery-print link",
  orderPage.includes("/delivery-print") && orderPage.includes("納品書PDF")
);
assert(
  "order detail keeps purchase-order print link",
  orderPage.includes("/print") && orderPage.includes("発注書PDF")
);

assert(
  "STEP1 has receiver name field",
  step1Src.includes("荷受け担当者") && step1Src.includes("receiver_name")
);
assert(
  "memo upsert for receiver name",
  extrasSrc.includes("荷受け担当者") && extrasSrc.includes("upsertLabeledMemoFields")
);

assert(
  "print isolation via order-print-page visibility",
  page.includes("order-print-page") &&
    page.includes("body *") &&
    page.includes("visibility: hidden") &&
    page.includes("visibility: visible")
);

assert(
  "@page A4 portrait",
  /@page\s*\{[\s\S]*size:\s*A4 portrait/.test(page)
);

assert(
  "header shows title and order meta",
  page.includes(">納品書<") &&
    page.includes("発注番号") &&
    page.includes("納品日") &&
    page.includes("delivered_date")
);

assert(
  "no delivery note number",
  !page.includes("納品書番号") && !page.includes("delivery_note")
);

assert(
  "delivery destination fields",
  page.includes("納品先") &&
    page.includes("顧客名") &&
    page.includes("納品先住所") &&
    page.includes("納品先電話番号") &&
    page.includes("荷受け担当者") &&
    page.includes("parseCaseExtras")
);

assert(
  "case info shows case number only",
  page.includes("案件情報") &&
    page.includes("案件番号") &&
    !page.includes("案件名")
);

assert(
  "line columns without prices",
  page.includes(">メーカー<") &&
    page.includes(">型番<") &&
    page.includes(">商品名<") &&
    page.includes(">数量<") &&
    !page.includes(">単価<") &&
    !page.includes(">金額<")
);

assert(
  "product identity reuse",
  page.includes("resolveProductIdentity") &&
    page.includes("displayIdentityValue") &&
    page.includes("listOrderItemsByOrderId")
);

assert(
  "memo section hidden when empty",
  page.includes("orderMemo") && page.includes("orderMemo ?")
);

assert(
  "footer company from settings and attribution",
  page.includes("PrintCompanyFooter") &&
    page.includes("fetchCompanySettingsForPrint") &&
    page.includes("本納品書は ValueOS より出力されました") &&
    page.includes("会社情報の取得に失敗しました")
);

assert(
  "footer avoids page break",
  /\.order-print-footer[\s\S]*break-inside:\s*avoid/.test(page)
);

assert(
  "table header repeats on page break",
  page.includes("display: table-header-group")
);

assert(
  "purchase order print unchanged",
  orderPrint.includes("発 注 書") || orderPrint.includes("発注書")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-case-registration-step1-simplify-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("registration memo behavior", behavior.status === 0);

const orderPrintTest = spawnSync("node", ["scripts/pr-order-print-document-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (orderPrintTest.status !== 0) {
  process.stdout.write(orderPrintTest.stdout || "");
  process.stderr.write(orderPrintTest.stderr || "");
}
assert("purchase order print regression", orderPrintTest.status === 0);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(tsc.stdout || "");
process.stderr.write(tsc.stderr || "");
assert("tsc --noEmit", tsc.status === 0);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, CI: "true" },
});
if (build.status !== 0) {
  process.stdout.write(build.stdout || "");
  process.stderr.write(build.stderr || "");
}
assert("npm run build", build.status === 0);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall delivery print document checks passed");
