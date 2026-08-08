/**
 * PR97: 発注書税表示契約テスト
 * Run: node scripts/pr-order-print-tax-display-test.mjs
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

const page = read("app/orders/[id]/print/page.tsx");
const helper = read("lib/orders/orderPrintTaxDisplay.ts");
const invoiceTax = read("lib/invoices/invoiceTax.ts");

assert(
  "uses shared invoice tax helper for display",
  helper.includes("calculateInvoiceAmountInclusive") &&
    helper.includes("buildOrderPrintTaxDisplay")
);
assert(
  "invoice tax rule remains floor 10%",
  invoiceTax.includes("Math.floor(safeSubtotal * INVOICE_CONSUMPTION_TAX_RATE)")
);
assert(
  "print shows three-tier totals",
  page.includes("発注小計（税抜）") &&
    page.includes("消費税（10%）") &&
    page.includes("発注合計（税込）") &&
    page.includes("buildOrderPrintTaxDisplay")
);
assert(
  "line headers mark tax-exclusive",
  page.includes("単価（税抜）") && page.includes("金額（税抜）")
);
assert(
  "keeps item/order_amount fallback",
  page.includes("items.length > 0") &&
    page.includes("order.order_amount") &&
    page.includes("item.amount")
);
assert(
  "does not tax per line item",
  !page.includes("buildOrderPrintTaxDisplay(toNumber(item") &&
    !page.includes("calculateInvoiceAmountInclusive(toNumber(item")
);
assert(
  "keeps company footer / memo / product columns",
  page.includes("PrintCompanyFooter") &&
    page.includes("order.memo") &&
    page.includes("メーカー") &&
    page.includes("商品名") &&
    page.includes("備考")
);

const porcelain =
  spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout || "";

assert(
  "no forbidden area changes",
  !/supabase\/migrations\//.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/app\/invoices\//.test(porcelain) &&
    !/delivery-print/.test(porcelain) &&
    !/create_purchase_orders/.test(porcelain) &&
    !/app\/api\//.test(porcelain)
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-order-print-tax-display-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

const doc = spawnSync("node", ["scripts/pr-order-print-document-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(doc.stdout || "");
process.stderr.write(doc.stderr || "");
assert("order print document test", doc.status === 0, `status=${doc.status}`);

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
console.log("\nAll order print tax display checks passed");
