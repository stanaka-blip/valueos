/**
 * PR-B: master default_supplier_id UI static checks
 * Run: node scripts/pr-b-default-supplier-ui-test.mjs
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

const files = [
  "app/products/new/page.tsx",
  "app/products/[id]/edit/page.tsx",
  "app/packages/new/page.tsx",
  "app/packages/[id]/edit/page.tsx",
];

for (const rel of files) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  assert(`${rel} has 標準仕入先 label`, src.includes("標準仕入先"));
  assert(`${rel} has default_supplier_id field`, src.includes("default_supplier_id"));
  assert(`${rel} allows empty/null`, src.includes('default_supplier_id: form.default_supplier_id || null') || src.includes("default_supplier_id: form.default_supplier_id || null"));
  assert(`${rel} loads suppliers`, src.includes('.from("suppliers")'));
  assert(`${rel} has 未設定 option`, src.includes("未設定"));
}

const dealerDiff = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "app/dealer"],
  { cwd: ROOT, encoding: "utf8" }
);
assert("dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

const scope = spawnSync(
  "git",
  ["diff", "--name-only", "origin/main", "--", "app/cases", "app/api", "supabase/migrations", "lib/gateway", "proxy.ts"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no cases/api/migration/gateway/proxy changes",
  (scope.stdout || "").trim() === "",
  scope.stdout
);

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL PR-B STATIC CHECKS PASSED");
