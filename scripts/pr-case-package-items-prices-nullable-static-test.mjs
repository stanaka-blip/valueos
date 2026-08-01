/**
 * Static checks for case_package_items price nullability hotfix.
 * Run: node scripts/pr-case-package-items-prices-nullable-static-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

const migPath = "supabase/migrations/20260801120000_case_package_items_prices_nullable.sql";
const mig = readFileSync(join(ROOT, migPath), "utf8");
const applyPath = "scripts/prod-ddl/case-package-items-prices-nullable/02-apply.sql";
const apply = readFileSync(join(ROOT, applyPath), "utf8");

assert("targets case_package_items", mig.includes("case_package_items"));
assert("targets unit_purchase_price", mig.includes("unit_purchase_price"));
assert("targets total_purchase_price", mig.includes("total_purchase_price"));
assert("defensive is_nullable NO filter", mig.includes("is_nullable = 'NO'"));
assert("DROP NOT NULL", mig.includes("DROP NOT NULL"));
assert("no UPDATE business tables", !/UPDATE\s+public\.(case_package_items|case_products|cases)\b/i.test(mig));
assert("no DELETE business tables", !/DELETE\s+FROM\s+public\.(case_package_items|case_products|cases)\b/i.test(mig));
assert("no RPC replace", !/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(mig));
assert("no DEFAULT change", !/SET\s+DEFAULT|DROP\s+DEFAULT/i.test(mig));
assert("no GRANT/REVOKE", !/\b(GRANT|REVOKE)\b/i.test(mig));

const migMd5 = createHash("md5").update(mig).digest("hex");
const applyMd5 = createHash("md5").update(apply).digest("hex");
assert("apply SQL byte-identical to migration", migMd5 === applyMd5, `${migMd5} vs ${applyMd5}`);

const dealerDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", "app/dealer"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

const uiDiff = spawnSync(
  "git",
  [
    "diff",
    "--name-only",
    "origin/main",
    "--",
    "app/components/case-registration",
    "app/cases/new",
    "lib/cases",
    "supabase/migrations/20260801090000_case_registration_nullable_prices.sql",
  ],
  { cwd: ROOT, encoding: "utf8" }
);
assert("no RPC/UI/client changes vs main", (uiDiff.stdout || "").trim() === "", uiDiff.stdout);

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL STATIC CHECKS PASSED");
