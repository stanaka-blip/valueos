/**
 * PR-A static checks for products/packages default_supplier_id migration.
 * No production DDL. Run: node scripts/pr-a-default-supplier-id-test.mjs
 */
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

const migPath = join(
  ROOT,
  "supabase/migrations/20260727020000_products_packages_default_supplier_id.sql"
);
const mig = readFileSync(migPath, "utf8");
const types = readFileSync(join(ROOT, "lib/database.types.ts"), "utf8");

assert("migration adds products.default_supplier_id", /ALTER TABLE public\.products[\s\S]*default_supplier_id uuid/.test(mig));
assert("migration adds packages.default_supplier_id", /ALTER TABLE public\.packages[\s\S]*default_supplier_id uuid/.test(mig));
assert("products FK name", mig.includes("products_default_supplier_id_fkey"));
assert("packages FK name", mig.includes("packages_default_supplier_id_fkey"));
assert("FK references suppliers(id)", (mig.match(/REFERENCES public\.suppliers \(id\)/g) || []).length >= 2);
assert("ON DELETE SET NULL twice", (mig.match(/ON DELETE SET NULL/g) || []).length >= 2);
assert("products index", mig.includes("products_default_supplier_id_idx"));
assert("packages index", mig.includes("packages_default_supplier_id_idx"));
assert("re-run: ADD COLUMN IF NOT EXISTS", (mig.match(/ADD COLUMN IF NOT EXISTS default_supplier_id/g) || []).length === 2);
assert("re-run: pg_constraint existence check", mig.includes("FROM pg_constraint") && mig.includes("already exists; skipping recreate"));
assert("re-run: CREATE INDEX IF NOT EXISTS", (mig.match(/CREATE INDEX IF NOT EXISTS/g) || []).length === 2);
assert("no backfill UPDATE", !/\bUPDATE\b/i.test(mig));
assert("no NOT NULL on new columns", !/default_supplier_id uuid NOT NULL/i.test(mig));
assert("types products.default_supplier_id", /products: \{[\s\S]*default_supplier_id: string \| null;/.test(types));
assert("types packages.default_supplier_id", /packages: \{[\s\S]*default_supplier_id: string \| null;/.test(types));
assert("types products FK relationship", types.includes('foreignKeyName: "products_default_supplier_id_fkey"'));
assert("types packages FK relationship", types.includes('foreignKeyName: "packages_default_supplier_id_fkey"'));

// scope: no UI / PR39 files in this commit checked via git later; static: no dealer/cases/new in migration
assert("migration has no app paths", !mig.includes("app/"));

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL PR-A STATIC CHECKS PASSED");
