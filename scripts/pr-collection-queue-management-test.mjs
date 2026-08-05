/**
 * 回収管理キュー静的契約テスト
 * Run: node scripts/pr-collection-queue-management-test.mjs
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

const page = read("app/queues/collections/page.tsx");
const logic = read("lib/queues/collectionQueue.ts");
const loader = read("lib/queues/loadCollectionQueue.ts");
const sidebar = read("app/components/AppSidebar.tsx");

assert("queue page loads collection queue", page.includes("loadCollectionQueue"));
assert(
  "queue columns present",
  page.includes("案件番号") &&
    page.includes("顧客名") &&
    page.includes("販売店") &&
    page.includes("決済条件") &&
    page.includes("金額") &&
    page.includes("状態") &&
    page.includes("次の対応") &&
    page.includes("期限")
);
assert(
  "reuses existing payment / workflow helpers",
  logic.includes("sumConfirmedPaidAmount") &&
    logic.includes("summarizeInvoicePayments") &&
    logic.includes("areAllOrdersDelivered") &&
    logic.includes("computeCreditDates") &&
    logic.includes("CARD_SUCCESS_STATUSES") &&
    logic.includes("LOAN_APPROVED_STATUSES") &&
    logic.includes("approval_number")
);
assert(
  "settlement branches present",
  logic.includes('"前金"') &&
    logic.includes('"売掛"') &&
    logic.includes('"カード"') &&
    logic.includes('"3社間決済"')
);
assert(
  "no finance ledger invention",
  !logic.includes("信販入金") &&
    !logic.includes("販売店支払") &&
    !logic.includes("材料代")
);
assert(
  "no summary cards / ranking",
  !page.includes("ランキング") && !page.includes("グラフ")
);
assert(
  "sidebar still points to /queues/collections",
  sidebar.includes('href: "/queues/collections"')
);
assert(
  "files exist",
  existsSync(join(ROOT, "lib/queues/collectionQueue.ts")) &&
    existsSync(join(ROOT, "lib/queues/loadCollectionQueue.ts"))
);
assert(
  "collections queue is no longer placeholder-only",
  !page.includes("準備中") && !page.includes("QueuePlaceholder")
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

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-collection-queue-management-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll collection queue management checks passed");
