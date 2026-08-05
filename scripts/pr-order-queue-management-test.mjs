/**
 * 発注管理キュー静的契約テスト
 * Run: node scripts/pr-order-queue-management-test.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

const page = read("app/queues/orders/page.tsx");
const logic = read("lib/queues/orderQueue.ts");
const loader = read("lib/queues/loadOrderQueue.ts");
const orderNew = read("app/cases/[id]/orders/new/page.tsx");
const sidebar = read("app/components/AppSidebar.tsx");

assert("queue page loads order queue", page.includes("loadOrderQueue"));
assert(
  "queue columns present",
  page.includes("工事日") &&
    page.includes("案件番号") &&
    page.includes("顧客名") &&
    page.includes("販売店") &&
    page.includes("決済条件") &&
    page.includes("発注可否") &&
    page.includes("発注登録")
);
assert(
  "queue uses construction_desired_date",
  loader.includes("construction_desired_date") &&
    logic.includes("construction_desired_date")
);
assert(
  "queue filters cancel / zero active orders / has targets",
  logic.includes("isActiveCaseStatus") &&
    logic.includes("activeOrderCount") &&
    logic.includes("hasOrderableTargets")
);
assert(
  "queue does not use case status for unordered detection",
  !logic.includes('status === "未発注"') &&
    !logic.includes("発注待ち")
);
assert(
  "settlement gate reasons",
  logic.includes("前金未入金") &&
    logic.includes("カード決済待ち") &&
    logic.includes("審査承認待ち") &&
    logic.includes("決済区分未設定")
);
assert(
  "order date today initial and editable",
  orderNew.includes("order_date: getTodayString()") &&
    orderNew.includes('name="order_date"') &&
    !orderNew.includes("readOnly")
);
assert(
  "expected delivery required on order form",
  orderNew.includes("納品予定日を入力してください") &&
    /label="納品予定日"\s+required/.test(orderNew) &&
    /name="expected_delivery_date"[\s\S]*required/.test(orderNew)
);
assert(
  "sidebar still points to /queues/orders",
  sidebar.includes('href: "/queues/orders"')
);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
const porcelain = status.stdout || "";
assert("no dealer path changes", !/app\/dealer\//.test(porcelain));
assert(
  "no migration / rpc / api purchase-orders changes in WT",
  !/supabase\/migrations\//.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain)
);

assert(
  "files exist",
  existsSync(join(ROOT, "lib/queues/orderQueue.ts")) &&
    existsSync(join(ROOT, "lib/queues/loadOrderQueue.ts"))
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-order-queue-management-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

// sidebar placeholder test still expects 準備中 on orders — update via separate assert here
const ordersPage = read("app/queues/orders/page.tsx");
assert("orders queue is no longer placeholder-only", !ordersPage.includes("準備中"));

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll order queue management checks passed");
