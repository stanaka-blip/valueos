/**
 * 納品確認（発注編集）画面改善 静的契約テスト
 * Run: node scripts/pr-delivery-confirm-order-edit-test.mjs
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

const page = read("app/orders/[id]/edit/page.tsx");
const queue = read("lib/queues/deliveryQueue.ts");

assert(
  "delivery queue still links to /orders/[id]/edit",
  queue.includes("confirmHref: `/orders/${confirm.id}/edit`")
);

assert(
  "edit loads order_amount for header fallback",
  page.includes("order_amount") && page.includes("headerOrderAmount")
);

assert(
  "edit loads case delivery fields",
  page.includes("delivery_address") &&
    page.includes("site_address") &&
    page.includes("customer_name") &&
    page.includes("memo")
);

assert(
  "edit uses parseCaseExtras for receiver fields",
  page.includes("parseCaseExtras") &&
    page.includes("receiverPhone") &&
    page.includes("receiverName")
);

assert(
  "edit shows read-only delivery confirm block",
  page.includes("納品先（確認）") &&
    page.includes("納品先住所") &&
    page.includes("納品先電話番号") &&
    page.includes("荷受け担当者") &&
    page.includes("読取専用")
);

assert(
  "edit does not invent unified 納品先名 label",
  !page.includes('label="納品先名"') && page.includes('label="顧客名"')
);

assert(
  "edit shows dealer 納品先名称 only when present",
  page.includes("deliveryName") && page.includes('label="納品先名称"')
);

assert(
  "amount prefers lines total, falls back to header",
  page.includes("lines.length > 0 ? linesTotal : headerOrderAmount")
);

assert(
  "empty lines show warning, not blank table",
  page.includes("発注明細がありません") &&
    page.includes("旧データで明細が未作成")
);

assert(
  "line columns are maker/model/qty/unit/amount (no product name column)",
  page.includes(">メーカー<") &&
    page.includes(">型番<") &&
    page.includes(">数量<") &&
    page.includes(">仕入単価<") &&
    page.includes(">金額<") &&
    !page.includes(">商品名<")
);

assert(
  "still uses listOrderItemsByOrderId",
  page.includes("listOrderItemsByOrderId")
);

assert(
  "product fetch failure is not silently ignored",
  page.includes("商品情報の取得に失敗しました")
);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
const porcelain = status.stdout || "";
assert("no dealer path changes", !/app\/dealer\//.test(porcelain));
assert(
  "no migration / rpc / workflow engine changes",
  !/supabase\/migrations\//.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain) &&
    !/lib\/workflow\/WorkflowEngine\.ts/.test(porcelain) &&
    !/lib\/workflow\/settlementRules\.ts/.test(porcelain)
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll delivery confirm order edit checks passed");
