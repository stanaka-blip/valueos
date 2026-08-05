/**
 * 発注書印刷帳票（PR #64）静的契約テスト
 * Run: node scripts/pr-order-print-document-test.mjs
 */
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

const page = read("app/orders/[id]/print/page.tsx");
const printBtn = read("app/orders/[id]/print/PrintButton.tsx");
const layout = read("app/layout.tsx");
const sidebar = read("app/components/AppSidebar.tsx");

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
  "does not modify RootLayout / AppSidebar for print",
  layout.includes("AppSidebar") &&
    !sidebar.includes("@media print") &&
    !layout.includes("@media print")
);

assert(
  "screen keeps back link and manual print button",
  page.includes("発注詳細へ戻る") &&
    page.includes('href={`/orders/${order.id}`}') &&
    page.includes("PrintButton") &&
    printBtn.includes("window.print()") &&
    printBtn.includes("print:hidden")
);

assert(
  "no automatic window.print on load",
  !page.includes("window.print()") &&
    !page.includes("setTimeout(() => window.print()")
);

assert(
  "fetches site_address and delivery_address",
  page.includes("site_address") && page.includes("delivery_address")
);

assert(
  "fetches product name, model_no and manufacturer",
  page.includes("model_no") &&
    page.includes("manufacturers") &&
    /products[\s\S]*select\("id, name, model_no, manufacturers\(name\)"\)/.test(
      page
    )
);

assert(
  "header fields present",
  page.includes("発注番号") &&
    page.includes("発注日") &&
    page.includes("納品予定日") &&
    page.includes("御中") &&
    page.includes("案件番号") &&
    page.includes("顧客名") &&
    page.includes("現場住所") &&
    page.includes("納品先住所") &&
    page.includes("発注ステータス")
);

assert(
  "line columns present (print keeps 商品名)",
  page.includes(">メーカー<") &&
    page.includes(">型番<") &&
    page.includes(">商品名<") &&
    page.includes(">数量<") &&
    page.includes(">単価<") &&
    page.includes(">金額<") &&
    page.includes(">備考<") &&
    !page.includes("メーカー型番")
);

assert(
  "total and footer present",
  page.includes("発注合計") &&
    page.includes("発注備考") &&
    page.includes("本発注書はValueOSより出力されました")
);

assert(
  "no invented company address/phone/fax/contact",
  !page.includes("会社住所を設定してください") &&
    !page.includes("株式会社バリューエコロジー") &&
    !/TEL：/.test(page) &&
    !page.includes("FAX") &&
    !page.includes("担当者")
);

assert(
  "PACKAGE uses order_items only (no case_packages parent expansion)",
  page.includes("order_items は構成品・単体商品行のみ") &&
    page.includes("listOrderItemsByOrderId") &&
    !page.includes("case_packages") &&
    !page.includes("buildOrderTargets")
);

assert(
  "row break-inside avoid for print pagination",
  page.includes("break-inside: avoid") &&
    page.includes("display: table-header-group")
);

assert(
  "toolbar is print:hidden",
  page.includes("print:hidden")
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll order print document checks passed");
