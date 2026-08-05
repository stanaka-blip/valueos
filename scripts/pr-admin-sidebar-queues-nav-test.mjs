/**
 * 管理者サイドバー業務フロー整理（PR #65）静的テスト
 * Run: node scripts/pr-admin-sidebar-queues-nav-test.mjs
 */
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

const sidebar = read("app/components/AppSidebar.tsx");
const casesPage = read("app/cases/page.tsx");

assert(
  "sidebar business nav labels",
  sidebar.includes('name: "全案件"') &&
    sidebar.includes('href: "/cases"') &&
    sidebar.includes('name: "発注管理"') &&
    sidebar.includes('href: "/queues/orders"') &&
    sidebar.includes('name: "納品管理"') &&
    sidebar.includes('href: "/queues/deliveries"') &&
    sidebar.includes('name: "回収管理"') &&
    sidebar.includes('href: "/queues/collections"')
);

assert(
  "sidebar removes old business links",
  !sidebar.includes('name: "案件管理"') &&
    !sidebar.includes('name: "受注管理"') &&
    !sidebar.includes('href: "/admin/orders"') &&
    !sidebar.includes('name: "請求管理"') &&
    !sidebar.includes('href: "/invoices"') &&
    !sidebar.includes('name: "入金管理"') &&
    !sidebar.includes('href: "/payments"') &&
    !sidebar.includes('name: "タスク管理"') &&
    !sidebar.includes('href: "/tasks"')
);

assert(
  "master section unchanged markers",
  sidebar.includes('label: "マスタ"') &&
    sidebar.includes('href: "/dealers"') &&
    sidebar.includes('href: "/products"') &&
    sidebar.includes('href: "/suppliers"')
);

assert(
  "cases page renamed to 全案件",
  casesPage.includes(">全案件<") || casesPage.includes("全案件\n") ||
    /全案件/.test(casesPage)
);
assert("cases page keeps /cases route file", existsSync(join(ROOT, "app/cases/page.tsx")));

assert(
  "queue placeholder pages exist",
  existsSync(join(ROOT, "app/queues/orders/page.tsx")) &&
    existsSync(join(ROOT, "app/queues/deliveries/page.tsx")) &&
    existsSync(join(ROOT, "app/queues/collections/page.tsx")) &&
    existsSync(join(ROOT, "app/queues/QueuePlaceholder.tsx"))
);

const ordersQ = read("app/queues/orders/page.tsx");
const deliveriesQ = read("app/queues/deliveries/page.tsx");
const collectionsQ = read("app/queues/collections/page.tsx");
const placeholder = read("app/queues/QueuePlaceholder.tsx");

assert(
  "placeholders say 準備中",
  placeholder.includes("準備中") &&
    ordersQ.includes("発注管理") &&
    deliveriesQ.includes("納品管理") &&
    collectionsQ.includes("回収管理")
);

assert(
  "legacy pages not deleted",
  existsSync(join(ROOT, "app/admin/orders/page.tsx")) &&
    existsSync(join(ROOT, "app/invoices/page.tsx")) &&
    existsSync(join(ROOT, "app/payments/page.tsx")) &&
    existsSync(join(ROOT, "app/tasks/page.tsx"))
);

assert(
  "no migration / api / dealer / workflow diffs expected in this PR surface",
  !sidebar.includes("create_purchase_orders") &&
    !ordersQ.includes("supabase")
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll admin sidebar queues nav checks passed");
