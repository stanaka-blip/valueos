/**
 * 小数数量のパースと金額計算
 * Run: npx tsx "app/cases/[id]/buildOrderLines.decimalQuantity.test.ts"
 */
import assert from "node:assert/strict";

import { parseOrderQuantity } from "./buildOrderLines";
import { calcLineAmount } from "@/app/orders/orderUtils";

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

check("4.68 is accepted", () => {
  assert.equal(parseOrderQuantity("4.68"), 4.68);
  assert.equal(parseOrderQuantity(4.68), 4.68);
});

check("4.128 is accepted", () => {
  assert.equal(parseOrderQuantity("4.128"), 4.128);
});

check("integer still works", () => {
  assert.equal(parseOrderQuantity("3"), 3);
});

check("rejects zero/negative/empty", () => {
  assert.equal(parseOrderQuantity("0"), null);
  assert.equal(parseOrderQuantity("-1"), null);
  assert.equal(parseOrderQuantity(""), null);
  assert.equal(parseOrderQuantity("abc"), null);
});

check("4.68 x 56000 = 262080", () => {
  assert.equal(calcLineAmount(4.68, 56000), 262080);
});

check("4.128 x 69000 = 284832", () => {
  assert.equal(calcLineAmount(4.128, 69000), 284832);
});

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll decimal quantity checks passed");
