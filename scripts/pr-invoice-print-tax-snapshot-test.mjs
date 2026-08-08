/**
 * 請求書印刷: 税スナップショット優先 静的契約
 * Run: node scripts/pr-invoice-print-tax-snapshot-test.mjs
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

const page = read("app/invoices/[id]/print/page.tsx");
const helper = read("lib/invoices/invoicePrintTaxDisplay.ts");
const orderPrint = read("app/orders/[id]/print/page.tsx");
const deliveryPrint = read("app/orders/[id]/delivery-print/page.tsx");

assert(
  "print selects tax snapshot columns",
  page.includes("subtotal_ex_tax") && page.includes("tax_amount")
);

assert(
  "uses resolveInvoicePrintTaxDisplay",
  page.includes("resolveInvoicePrintTaxDisplay") &&
    helper.includes('source: "snapshot"') &&
    helper.includes('source: "legacy_fallback"')
);

assert(
  "legacy fallback keeps floor(/1.1)",
  helper.includes("Math.floor(invoiceAmountInclusive / 1.1)")
);

assert(
  "does not recompute tax from formal rule on print",
  !helper.includes("INVOICE_CONSUMPTION_TAX_RATE") &&
    !helper.includes("calculateInvoiceAmountInclusive") &&
    !helper.includes("* 0.10")
);

assert(
  "invoice_amount remains formal inclusive display",
  page.includes("formatYen(invoiceAmount)") &&
    page.includes("invoices.invoice_amount を正式値")
);

assert(
  "order/delivery prints untouched by this change",
  !orderPrint.includes("resolveInvoicePrintTaxDisplay") &&
    !deliveryPrint.includes("resolveInvoicePrintTaxDisplay")
);

const porcelain =
  spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout || "";

assert(
  "no migration / workflow / save / dealer edits",
  !/supabase\/migrations\//.test(porcelain) &&
    !/invoiceTaxSnapshot\.ts/.test(porcelain) &&
    !/invoices\/new\/page\.tsx/.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain)
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-invoice-print-tax-snapshot-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

const doc = spawnSync("node", ["scripts/pr-invoice-print-document-test.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(doc.stdout || "");
process.stderr.write(doc.stderr || "");
assert("invoice print document suite exit 0", doc.status === 0, `status=${doc.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll invoice print tax snapshot checks passed");
