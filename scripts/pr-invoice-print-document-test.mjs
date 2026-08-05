/**
 * PR #83: 請求書印刷帳票リニューアルテスト（本番DB書込なし）
 * 実行: node scripts/pr-invoice-print-document-test.mjs
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
const deliveryTest = read("scripts/pr-delivery-print-document-test.mjs");
const orderTest = read("scripts/pr-order-print-document-test.mjs");

assert(
  "unified print page class",
  page.includes("order-print-page") &&
    page.includes("order-print-title") &&
    page.includes(">請求書<")
);

assert(
  "header invoice meta",
  page.includes("請求番号") &&
    page.includes("請求日") &&
    page.includes("支払期限")
);

assert(
  "bill-to uses dealer not customer as addressee",
  page.includes("請求先") &&
    page.includes("御中") &&
    page.includes("dealers") &&
    page.includes("dealer?.name")
);

assert(
  "issuer company name only",
  page.includes("株式会社Value Ecology") &&
    !page.includes("Value Group Inc.") &&
    !page.includes("会社住所を設定してください") &&
    !page.includes("TEL：会社電話番号")
);

assert(
  "amount summary three items",
  page.includes("今回請求額（税抜）") &&
    page.includes("消費税") &&
    page.includes("ご請求金額（税込）") &&
    page.includes("Math.floor(invoiceAmount / 1.1)")
);

assert(
  "no carryover fields",
  !page.includes("前回繰越") &&
    !page.includes("御入金額") &&
    !page.includes("調整") &&
    !page.includes("繰越金額") &&
    !page.includes("商品明細合計")
);

assert(
  "case-level line without product snapshot",
  page.includes("案件請求") &&
    page.includes("請求時点の明細スナップショットはない") &&
    !page.includes('.from("case_products")')
);

assert(
  "line table columns",
  page.includes(">案件番号<") &&
    page.includes(">顧客名<") &&
    page.includes(">摘要<") &&
    page.includes(">金額<")
);

assert(
  "memo hidden when empty",
  page.includes("invoiceMemo ?") && page.includes("invoice.memo")
);

assert(
  "no placeholder invoice registration or bank",
  !page.includes("登録番号：T") &&
    !page.includes("T0000000000000") &&
    !page.includes("お振込先") &&
    !page.includes("設定してください") &&
    !page.includes("銀行名")
);

assert(
  "footer attribution",
  page.includes("本請求書は ValueOS より出力されました")
);

assert(
  "print isolation and footer page-break avoid",
  page.includes("visibility: hidden") &&
    /\.order-print-footer[\s\S]*break-inside:\s*avoid/.test(page)
);

assert(
  "A4 portrait",
  /@page\s*\{[\s\S]*size:\s*A4 portrait/.test(page)
);

const delivery = spawnSync("node", ["scripts/pr-delivery-print-document-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (delivery.status !== 0) {
  process.stdout.write(delivery.stdout || "");
  process.stderr.write(delivery.stderr || "");
}
assert("delivery print regression", delivery.status === 0);

const order = spawnSync("node", ["scripts/pr-order-print-document-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (order.status !== 0) {
  process.stdout.write(order.stdout || "");
  process.stderr.write(order.stderr || "");
}
assert("purchase order print regression", order.status === 0);

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
console.log("\nall invoice print document checks passed");
