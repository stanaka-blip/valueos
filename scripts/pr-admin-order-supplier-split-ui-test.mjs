/**
 * 管理者発注: 仕入先分割 UI / API 静的契約テスト（本番DB書込なし）
 * Run: node scripts/pr-admin-order-supplier-split-ui-test.mjs
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

const page = read("app/cases/[id]/orders/new/page.tsx");
const targets = read("app/cases/[id]/orders/orderTargets.ts");
const api = read("app/api/cases/[id]/purchase-orders/route.ts");
const logic = read("lib/purchaseOrders/createPurchaseOrdersLogic.ts");
const submit = read("app/cases/[id]/orders/new/submitPurchaseOrders.ts");
const auth = read("lib/gateway/authCookie.ts");
const types = read("lib/database.types.ts");

assert(
  "removes header common supplier",
  !page.includes('name="supplier_id"') &&
    !page.includes("dealers") &&
    !page.includes("resolveDealerDefaultSupplierId")
);
assert(
  "does not display order_type",
  !page.includes("発注区分") && !page.includes("order_type")
);
assert(
  "supplier per PRODUCT and PACKAGE",
  page.includes("handleProductSupplierChange") &&
    page.includes("handlePackageSupplierChange") &&
    page.includes("仕入先はパッケージに準拠")
);
assert(
  "init from product/package default_supplier_id",
  targets.includes("default_supplier_id") &&
    /products \([\s\S]*default_supplier_id/.test(page) &&
    /packages \([\s\S]*default_supplier_id/.test(page)
);
assert(
  "groups by supplier and posts purchase-orders API",
  page.includes("groupLinesBySupplier") &&
    page.includes("submitPurchaseOrders") &&
    submit.includes("/purchase-orders") &&
    api.includes("create_purchase_orders") &&
    auth.includes("purchase-order-create:v1")
);
assert(
  "unique order numbers",
  targets.includes("generateUniqueOrderNumbers") &&
    page.includes("generateUniqueOrderNumbers")
);
assert(
  "price refresh on supplier/order_date",
  page.includes("asOfDate") && page.includes("runPriceRefresh")
);
assert(
  "settlement unset warns but does not hard-block save",
  page.includes("loadCaseWorkflow") &&
    page.includes("isSettlementTypeUnset") &&
    page.includes(
      "決済区分が未設定です。発注はできますが、請求処理までに設定してください。"
    ) &&
    page.includes("orderBlockedBySettlementRule") &&
    !page.includes("/dealer/")
);
assert(
  "groups order lines by supplier for display",
  page.includes("groupOrderTargetsBySupplier") &&
    page.includes("formatPurchaseOrderSheetLabel") &&
    page.includes("発注番号:") &&
    page.includes("発注金額合計:") &&
    page.includes("明細件数:") &&
    targets.includes("groupOrderTargetsBySupplier")
);
assert(
  "Japanese validation messages",
  targets.includes("仕入先を選択してください") &&
    targets.includes("仕入単価が未設定です") &&
    logic.includes("仕入先を選択してください")
);
assert(
  "database.types has create_purchase_orders",
  /create_purchase_orders:\s*\{/.test(types)
);

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert(
  "no dealer path changes",
  !/app\/dealer\//.test(status.stdout || "")
);
assert(
  "no new migration files in working tree for this UI PR",
  !/supabase\/migrations\//.test(status.stdout || "")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-admin-order-supplier-split-ui-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert(
  "behavior suite exit 0",
  behavior.status === 0,
  `status=${behavior.status}`
);

const legacy = spawnSync("node", ["scripts/pr-case-detail-order-ui-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(legacy.stdout || "");
process.stderr.write(legacy.stderr || "");
assert(
  "legacy order ui suite exit 0",
  legacy.status === 0,
  `status=${legacy.status}`
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll admin order supplier-split UI checks passed");
