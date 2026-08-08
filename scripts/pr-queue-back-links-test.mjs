/**
 * PR #94: 業務キューへ戻る導線
 * Run: node scripts/pr-queue-back-links-test.mjs
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

const orderNew = read("app/cases/[id]/orders/new/page.tsx");
const orderDetail = read("app/orders/[id]/page.tsx");
const orderEdit = read("app/orders/[id]/edit/page.tsx");
const invoiceNew = read("app/cases/[id]/invoices/new/page.tsx");
const invoiceDetail = read("app/invoices/[id]/page.tsx");
const paymentNew = read("app/invoices/[id]/payments/new/page.tsx");

assert(
  "order registration → /queues/orders",
  orderNew.includes('href="/queues/orders"') &&
    orderNew.includes("発注管理へ戻る") &&
    orderNew.includes("案件詳細へ戻る")
);

assert(
  "order detail → /queues/orders",
  orderDetail.includes('href="/queues/orders"') &&
    orderDetail.includes("発注管理へ戻る") &&
    orderDetail.includes("案件詳細へ戻る")
);

assert(
  "delivery confirm (order edit) → /queues/deliveries",
  orderEdit.includes('href="/queues/deliveries"') &&
    orderEdit.includes("納品管理へ戻る") &&
    orderEdit.includes("発注詳細へ戻る")
);

assert(
  "invoice registration → /queues/collections",
  invoiceNew.includes('href="/queues/collections"') &&
    invoiceNew.includes("回収管理へ戻る") &&
    invoiceNew.includes("案件詳細へ戻る")
);

assert(
  "invoice detail → /queues/collections",
  invoiceDetail.includes('href="/queues/collections"') &&
    invoiceDetail.includes("回収管理へ戻る") &&
    !invoiceDetail.includes("一覧へ戻る") &&
    !invoiceDetail.includes("/invoices/${invoice.id}/edit")
);

assert(
  "payment registration → /queues/collections",
  paymentNew.includes('href="/queues/collections"') &&
    paymentNew.includes("回収管理へ戻る") &&
    paymentNew.includes("請求詳細へ戻る")
);

const porcelain =
  spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout || "";

assert(
  "no workflow / db / rpc / dealer / save-logic files",
  !/supabase\/migrations\//.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/invoiceTaxSnapshot/.test(porcelain) &&
    !/createPaymentPayload/.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain)
);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(tsc.stdout || "");
process.stderr.write(tsc.stderr || "");
assert("tsc --noEmit", tsc.status === 0, `status=${tsc.status}`);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
assert("npm run build", build.status === 0, `status=${build.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll queue back-link checks passed");
