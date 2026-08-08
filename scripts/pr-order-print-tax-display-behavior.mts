/**
 * PR97: 発注書税表示 behavior
 * Run: npx tsx scripts/pr-order-print-tax-display-behavior.mts
 */
import assert from "node:assert/strict";

import { buildOrderPrintTaxDisplay } from "../lib/orders/orderPrintTaxDisplay.ts";
import { calculateInvoiceAmountInclusive } from "../lib/invoices/invoiceTax.ts";

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

check("税抜小計・消費税 floor・税込合計", () => {
  const d = buildOrderPrintTaxDisplay(1_000_000);
  assert.equal(d.subtotalExTax, 1_000_000);
  assert.equal(d.taxAmount, 100_000);
  assert.equal(d.totalInTax, 1_100_000);
});

check("消費税 = floor(税抜小計 × 10%)", () => {
  const d = buildOrderPrintTaxDisplay(1001);
  assert.equal(d.subtotalExTax, 1001);
  assert.equal(d.taxAmount, Math.floor(1001 * 0.1));
  assert.equal(d.taxAmount, 100);
  assert.equal(d.totalInTax, 1101);
});

check("請求側ヘルパと同じ結果（明細単位では呼ばない前提）", () => {
  const invoice = calculateInvoiceAmountInclusive(250_050);
  const order = buildOrderPrintTaxDisplay(250_050);
  assert.equal(order.subtotalExTax, invoice.subtotalExTax);
  assert.equal(order.taxAmount, invoice.tax);
  assert.equal(order.totalInTax, invoice.invoiceAmountInclusive);
});

check("0円は税も0", () => {
  const d = buildOrderPrintTaxDisplay(0);
  assert.equal(d.subtotalExTax, 0);
  assert.equal(d.taxAmount, 0);
  assert.equal(d.totalInTax, 0);
});

check("レガシー発注: orders.order_amount を税抜小計として利用できる", () => {
  const legacyOrderAmount = 55555;
  const d = buildOrderPrintTaxDisplay(legacyOrderAmount);
  assert.equal(d.subtotalExTax, 55555);
  assert.equal(d.taxAmount, Math.floor(55555 * 0.1));
  assert.equal(d.totalInTax, 55555 + Math.floor(55555 * 0.1));
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll order print tax display behavior checks passed");
