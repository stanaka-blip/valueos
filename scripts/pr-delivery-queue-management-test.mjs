/**
 * 納品管理キュー静的契約テスト
 * Run: node scripts/pr-delivery-queue-management-test.mjs
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

const page = read("app/queues/deliveries/page.tsx");
const logic = read("lib/queues/deliveryQueue.ts");
const loader = read("lib/queues/loadDeliveryQueue.ts");
const sidebar = read("app/components/AppSidebar.tsx");

assert("queue page loads delivery queue", page.includes("loadDeliveryQueue"));
assert(
  "queue columns present",
  page.includes("納品予定日") &&
    page.includes("工事日") &&
    page.includes("案件番号") &&
    page.includes("顧客名") &&
    page.includes("販売店") &&
    page.includes("発注数") &&
    page.includes("納品済数") &&
    page.includes("状態") &&
    page.includes("納品確認")
);
assert(
  "uses expected_delivery_date / delivered_date / construction_desired_date",
  loader.includes("expected_delivery_date") &&
    loader.includes("delivered_date") &&
    loader.includes("construction_desired_date") &&
    logic.includes("expected_delivery_date")
);
assert(
  "filters cancel / has active orders / not all delivered",
  logic.includes("isActiveCaseStatus") &&
    logic.includes("activeOrderCount") &&
    logic.includes("deliveredCount")
);
assert(
  "confirm links to order edit",
  logic.includes("/orders/") && logic.includes("/edit") && page.includes("confirmHref")
);
assert(
  "no summary cards / ranking",
  !page.includes("件数") && !page.includes("ランキング") && !page.includes("グラフ")
);
assert(
  "sidebar still points to /queues/deliveries",
  sidebar.includes('href: "/queues/deliveries"')
);
assert(
  "files exist",
  existsSync(join(ROOT, "lib/queues/deliveryQueue.ts")) &&
    existsSync(join(ROOT, "lib/queues/loadDeliveryQueue.ts"))
);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
const porcelain = status.stdout || "";
assert("no dealer path changes", !/app\/dealer\//.test(porcelain));
assert(
  "no migration / rpc / api changes in WT",
  !/supabase\/migrations\//.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain) &&
    !/app\/api\//.test(porcelain)
);

assert("deliveries queue is no longer placeholder-only", !page.includes("準備中"));

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-delivery-queue-management-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll delivery queue management checks passed");
