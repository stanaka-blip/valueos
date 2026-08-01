/**
 * Static checks for case registration nullable supplier/prices migration.
 * Run: node scripts/pr-case-registration-nullable-prices-static-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

const migPath = "supabase/migrations/20260801090000_case_registration_nullable_prices.sql";
const mig = readFileSync(join(ROOT, migPath), "utf8");
const client = readFileSync(join(ROOT, "lib/cases/createCaseRegistration.ts"), "utf8");

assert("migration exists content", mig.includes("CREATE OR REPLACE FUNCTION public.create_case_registration"));
assert("no sales_prices lookup", !/FROM public\.sales_prices/i.test(mig));
assert("no purchase_prices lookup", !/FROM public\.purchase_prices/i.test(mig));
assert("no PRICE_NOT_FOUND raise", !/APP:PRICE_NOT_FOUND/.test(mig));
assert("no PACKAGE_ITEM_PRICE_NOT_FOUND raise", !/APP:PACKAGE_ITEM_PRICE_NOT_FOUND/.test(mig));
assert("keeps PACKAGE_ITEMS_NOT_FOUND", mig.includes("PACKAGE_ITEMS_NOT_FOUND"));
assert("inserts NULL supplier/prices", /supplier_id[\s\S]*NULL, NULL, NULL/.test(mig) || mig.includes("NULL, NULL, false, NULL, v_memo"));
assert("DROP NOT NULL defensive", mig.includes("DROP NOT NULL"));
assert("no UPDATE case_products existing", !/UPDATE\s+public\.case_products/i.test(mig));
assert("no DELETE case_products", !/DELETE\s+FROM\s+public\.case_products/i.test(mig));
assert("no DROP default_supplier_id", !/DROP COLUMN.*default_supplier_id/i.test(mig));
assert("client supplier optional", client.includes("supplier_id?: string | null"));
assert("client docs say not saved", /登録時に保存しない/.test(client));

const dealerDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", "app/dealer"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

const uiDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "app/components/case-registration", "app/cases/new", "app/products", "app/packages"],
  { cwd: ROOT, encoding: "utf8" }
);
assert("no UI changes vs main", (uiDiff.stdout || "").trim() === "", uiDiff.stdout);

const adminDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "app/admin", "app/invoices", "app/payments", "app/orders"],
  { cwd: ROOT, encoding: "utf8" }
);
assert("no order/invoice/payment changes", (adminDiff.stdout || "").trim() === "", adminDiff.stdout);

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL STATIC CHECKS PASSED");
