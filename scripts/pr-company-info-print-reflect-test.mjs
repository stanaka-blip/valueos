/**
 * PR #89: 帳票への会社情報反映 静的契約テスト
 * Run: node scripts/pr-company-info-print-reflect-test.mjs
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

const order = read("app/orders/[id]/print/page.tsx");
const delivery = read("app/orders/[id]/delivery-print/page.tsx");
const invoice = read("app/invoices/[id]/print/page.tsx");
const blocks = read("app/components/print/CompanyPrintBlocks.tsx");
const action = read("lib/companyInfo/fetchCompanySettingsForPrintAction.ts");

assert(
  "order print uses Server Action path (not service_role)",
  order.includes("fetchCompanySettingsForPrint") &&
    order.includes("PrintCompanyFooter") &&
    !order.includes("getServiceRoleSupabase") &&
    !order.includes("getCompanySettingsAdmin")
);

assert(
  "delivery print uses Server Action path",
  delivery.includes("fetchCompanySettingsForPrint") &&
    delivery.includes("PrintCompanyFooter") &&
    !delivery.includes("getServiceRoleSupabase")
);

assert(
  "invoice print uses server admin loader",
  invoice.includes("getCompanySettingsAdmin") &&
    invoice.includes("InvoiceIssuerBlock") &&
    invoice.includes("InvoiceBankTransferBlock") &&
    !invoice.includes("getServiceRoleSupabase")
);

assert(
  "DB errors are not treated as empty company",
  order.includes("会社情報の取得に失敗しました") &&
    delivery.includes("会社情報の取得に失敗しました") &&
    invoice.includes("会社情報の取得に失敗しました") &&
    invoice.includes("帳票を空欄のまま出力しません")
);

assert(
  "conditional fields only (no placeholders)",
  blocks.includes("trimOrNull") &&
    blocks.includes("hasBankTransferInfo") &&
    !blocks.includes("設定してください") &&
    !blocks.includes("T0000000000000")
);

assert(
  "server action authenticates staff cookie",
  action.includes("unsealStaffSession") &&
    action.includes("AUTH_COOKIE_NAME") &&
    action.includes("getCompanySettingsAdmin")
);

assert(
  "no migration / workflow changes",
  (() => {
    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const porcelain = status.stdout || "";
    return (
      !/supabase\/migrations\//.test(porcelain) &&
      !/WorkflowEngine/.test(porcelain) &&
      !/settlementRules/.test(porcelain)
    );
  })()
);

const helpers = spawnSync(
  "npx",
  ["tsx", "scripts/pr-company-info-print-reflect-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(helpers.stdout || "");
process.stderr.write(helpers.stderr || "");
assert("behavior suite exit 0", helpers.status === 0);

const orderTest = spawnSync("node", ["scripts/pr-order-print-document-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(orderTest.stdout || "");
process.stderr.write(orderTest.stderr || "");
assert("order print regression", orderTest.status === 0);

const deliveryTest = spawnSync(
  "node",
  ["scripts/pr-delivery-print-document-test.mjs"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(deliveryTest.stdout || "");
process.stderr.write(deliveryTest.stderr || "");
assert("delivery print regression", deliveryTest.status === 0);

const invoiceTest = spawnSync(
  "node",
  ["scripts/pr-invoice-print-document-test.mjs"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(invoiceTest.stdout || "");
process.stderr.write(invoiceTest.stderr || "");
assert("invoice print regression", invoiceTest.status === 0);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll company info print reflect checks passed");
