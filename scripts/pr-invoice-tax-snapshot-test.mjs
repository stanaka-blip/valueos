/**
 * PR #92: 請求税スナップショット基盤 静的契約
 * Run: node scripts/pr-invoice-tax-snapshot-test.mjs
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

const migrationName = "20260807120000_invoice_tax_snapshot.sql";
const migration = read(`supabase/migrations/${migrationName}`);
const page = read("app/cases/[id]/invoices/new/page.tsx");
const snapshot = read("lib/invoices/invoiceTaxSnapshot.ts");
const types = read("lib/database.types.ts");
const printPage = read("app/invoices/[id]/print/page.tsx");

assert("migration file exists", existsSync(join(ROOT, "supabase/migrations", migrationName)));

assert(
  "adds nullable numeric columns without rewriting invoice_amount",
  migration.includes("ADD COLUMN IF NOT EXISTS subtotal_ex_tax numeric") &&
    migration.includes("ADD COLUMN IF NOT EXISTS tax_amount numeric") &&
    !/UPDATE\s+public\.invoices/i.test(migration) &&
    !/DROP\s+COLUMN/i.test(migration) &&
    !/RENAME\s+COLUMN/i.test(migration)
);

assert(
  "no backfill of existing invoices",
  !/UPDATE\s+.*SET\s+subtotal_ex_tax/i.test(migration) &&
    !/UPDATE\s+.*SET\s+tax_amount/i.test(migration)
);

assert(
  "database.types includes snapshot columns",
  types.includes("invoices:") &&
    types.includes("subtotal_ex_tax: number | null") &&
    types.includes("tax_amount: number | null")
);

assert(
  "create page saves snapshot via helper",
  page.includes("buildInvoiceTaxSnapshotForSave") &&
    page.includes("subtotal_ex_tax: taxSnapshot.subtotal_ex_tax") &&
    page.includes("tax_amount: taxSnapshot.tax_amount")
);

assert(
  "manual path does not reverse-calc tax",
  snapshot.includes("invoiceAmountTouched") &&
    snapshot.includes('source: "manual"') &&
    snapshot.includes("subtotal_ex_tax: null")
);

assert(
  "print keeps legacy floor(/1.1) fallback for NULL snapshot",
  printPage.includes("resolveInvoicePrintTaxDisplay") &&
    printPage.includes("floor(invoice_amount / 1.1)") &&
    read("lib/invoices/invoicePrintTaxDisplay.ts").includes(
      "Math.floor(invoiceAmountInclusive / 1.1)"
    )
);

const porcelain = spawnSync("git", ["status", "--porcelain"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout || "";

assert(
  "no workflow / dealer / order / payment edits",
  !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/app\/orders\//.test(porcelain) &&
    !/app\/invoices\/\[id\]\/payments\//.test(porcelain)
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-invoice-tax-snapshot-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior suite exit 0", behavior.status === 0, `status=${behavior.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll invoice tax snapshot checks passed");
