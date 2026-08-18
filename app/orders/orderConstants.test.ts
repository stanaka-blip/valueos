/**
 * 発注定数・実納品日
 * Run: npx tsx app/orders/orderConstants.test.ts
 */
import assert from "node:assert/strict";

import { resolveDeliveredDate } from "./orderConstants";

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

check("納品済でも実納品日が空なら today で埋めない", () => {
  assert.equal(resolveDeliveredDate("納品済", null, "2026-08-18"), null);
  assert.equal(resolveDeliveredDate("納品済", "", "2026-08-18"), null);
});

check("入力した実納品日をそのまま保存する", () => {
  assert.equal(
    resolveDeliveredDate("納品済", "2026-08-01", "2026-08-18"),
    "2026-08-01"
  );
});

check("発注済でも実納品日は消さない（登録日と独立）", () => {
  assert.equal(
    resolveDeliveredDate("発注済", "2026-08-01", "2026-08-18"),
    "2026-08-01"
  );
  assert.equal(resolveDeliveredDate("発注済", null, "2026-08-18"), null);
});

check("未発注でも実納品日は独立フィールド", () => {
  assert.equal(
    resolveDeliveredDate("未発注", "2026-07-31", "2026-08-18"),
    "2026-07-31"
  );
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll orderConstants checks passed");
