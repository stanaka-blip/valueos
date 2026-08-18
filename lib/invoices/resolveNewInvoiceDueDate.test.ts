/**
 * 新規請求フォームの支払期限初期値
 * Run: npx tsx lib/invoices/resolveNewInvoiceDueDate.test.ts
 */
import assert from "node:assert/strict";

import { resolveNewInvoiceDueDate } from "./resolveNewInvoiceDueDate";

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

check("ケースF: workflow paymentDueDate があれば初期値として採用", () => {
  const due = resolveNewInvoiceDueDate({
    userTouched: false,
    currentDueDate: "2026-09-30",
    workflowPaymentDueDate: "2026-08-31",
    fallbackDueDate: "2026-09-30",
  });
  assert.equal(due, "2026-08-31");
});

check("ケースG: ユーザーが支払期限を手動変更したら workflow 再取得で上書きしない", () => {
  const due = resolveNewInvoiceDueDate({
    userTouched: true,
    currentDueDate: "2026-10-15",
    workflowPaymentDueDate: "2026-08-31",
    fallbackDueDate: "2026-09-30",
  });
  assert.equal(due, "2026-10-15");
});

check("workflow が無いときは fallback / 現在値", () => {
  assert.equal(
    resolveNewInvoiceDueDate({
      userTouched: false,
      currentDueDate: "2026-09-30",
      workflowPaymentDueDate: null,
      fallbackDueDate: "2026-09-30",
    }),
    "2026-09-30"
  );
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll resolveNewInvoiceDueDate checks passed");
