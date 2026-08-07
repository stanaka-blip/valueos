/**
 * PR #91 Phase A: 請求金額オートフィル静的契約
 * Run: node scripts/pr-invoice-amount-autofill-test.mjs
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

const page = read("app/cases/[id]/invoices/new/page.tsx");
const tax = read("lib/invoices/invoiceTax.ts");
const autofill = read("lib/invoices/invoiceAmountAutofill.ts");
const salesPrices = read("lib/salesPrices.ts");

assert(
  "formal tax rule: floor(subtotal * 0.10) then + tax",
  tax.includes("Math.floor(safeSubtotal * INVOICE_CONSUMPTION_TAX_RATE)") &&
    tax.includes("invoiceAmountInclusive: safeSubtotal + tax")
);

assert(
  "page uses fetchActiveSalesPrice for PRODUCT and PACKAGE",
  page.includes("fetchActiveSalesPrice") &&
    page.includes('"PRODUCT"') &&
    page.includes('"PACKAGE"')
);

assert(
  "page reuses roundMoneyTotal / autofill helpers",
  page.includes("buildInvoiceAmountAutofill") &&
    page.includes("resolveLineFromLookup") &&
    salesPrices.includes("roundMoneyTotal")
);

assert(
  "unset price warning and label",
  page.includes("UNSET_PRICE_WARNING") &&
    page.includes("UNSET_PRICE_LABEL") &&
    autofill.includes("販売価格未設定の商品があります")
);

assert(
  "hand-edit guard for invoice_amount",
  page.includes("invoiceAmountTouchedRef") &&
    page.includes('name === "invoice_amount"')
);

assert(
  "does not write case_products.sales_price",
  !page.includes(".update({") || !/case_products[\s\S]{0,80}sales_price\s*:/.test(page)
);

assert(
  "invoice insert still uses form invoice_amount",
  page.includes("invoice_amount: invoiceAmount")
);

assert(
  "no print page changes in this PR scope files exist unchanged expectation",
  read("app/invoices/[id]/print/page.tsx").includes(
    "Math.floor(invoiceAmount / 1.1)"
  )
);

const porcelain = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout || "";

assert(
  "no migration / RPC / workflow / dealer / print edits",
  !/supabase\/migrations\//.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/app\/invoices\/\[id\]\/print\//.test(porcelain) &&
    !/create_case_registration/.test(porcelain)
);

assert(
  "behavior test file exists",
  existsSync(join(ROOT, "scripts/pr-invoice-amount-autofill-behavior.mts"))
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-invoice-amount-autofill-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll invoice amount autofill checks passed");
