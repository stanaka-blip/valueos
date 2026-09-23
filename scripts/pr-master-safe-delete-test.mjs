/**
 * マスタ安全削除 UI/API 契約
 * Run: node scripts/pr-master-safe-delete-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const core = read("lib/masters/masterDeleteCore.ts");
assert.match(core, /deleteDealerMaster/);
assert.match(core, /deleteContractorMaster/);
assert.match(core, /deleteManufacturerMaster/);
assert.match(core, /cases/);
assert.match(core, /sales_prices/);
assert.match(core, /dealer_settlements/);
assert.match(core, /product_series/);
assert.match(core, /products/);
assert.match(core, /packages/);
assert.match(core, /利用停止してください/);
assert.doesNotMatch(core, /ON DELETE CASCADE/i);

const api = read("app/api/masters/[kind]/[id]/delete/route.ts");
assert.match(api, /requireStaffAdminMutation/);
assert.match(api, /deleteMasterByKind/);

const btn = read("app/components/masters/MasterDeleteButton.tsx");
assert.match(btn, /完全に削除します/);
assert.match(btn, /元に戻せません/);

const list = read("app/components/masters/MasterListRowActions.tsx");
assert.match(list, /delete:/);
assert.match(list, /api\/masters/);

for (const rel of [
  "app/dealers/page.tsx",
  "app/contractors/page.tsx",
  "app/manufacturers/page.tsx",
]) {
  const src = read(rel);
  assert.match(src, /label: "削除"/);
  assert.match(src, /delete:/);
}

assert.match(read("app/dealers/[id]/page.tsx"), /MasterDeleteButton/);
assert.match(read("app/contractors/[id]/page.tsx"), /MasterDeleteButton/);
assert.match(read("app/manufacturers/[id]/page.tsx"), /MasterDeleteButton/);

console.log("OK master safe delete contract");
