/**
 * start_date NULL の仕入単価を有効とみなす
 * Run: npx tsx lib/purchasePrices.nullStartDate.test.ts
 */
import assert from "node:assert/strict";

import { matchesActivePurchaseWindow } from "./purchasePrices";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("OK", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, e);
  }
}

check("null start_date is active when end open", () => {
  assert.equal(
    matchesActivePurchaseWindow(
      { start_date: null, end_date: null, is_active: true },
      "2026-09-15"
    ),
    true
  );
});

check("future start_date is inactive", () => {
  assert.equal(
    matchesActivePurchaseWindow(
      { start_date: "2026-12-01", end_date: null, is_active: true },
      "2026-09-15"
    ),
    false
  );
});

check("expired end_date is inactive", () => {
  assert.equal(
    matchesActivePurchaseWindow(
      { start_date: null, end_date: "2026-01-01", is_active: true },
      "2026-09-15"
    ),
    false
  );
});

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll null start_date checks passed");
