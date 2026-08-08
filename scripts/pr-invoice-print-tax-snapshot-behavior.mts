/**
 * 請求書印刷: 税スナップショット優先表示の挙動テスト
 * Run: npx tsx scripts/pr-invoice-print-tax-snapshot-behavior.mts
 */
import assert from "node:assert/strict";

import { resolveInvoicePrintTaxDisplay } from "../lib/invoices/invoicePrintTaxDisplay.ts";

{
  const d = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 1100,
    subtotalExTax: 1000,
    taxAmount: 100,
  });
  assert.equal(d.source, "snapshot");
  assert.equal(d.subtotalExTax, 1000);
  assert.equal(d.taxAmount, 100);
  assert.equal(d.invoiceAmountInclusive, 1100);
  assert.equal(d.subtotalExTax + d.taxAmount, 1100);
  console.log("OK snapshot path uses stored values as-is");
}

{
  // 端数ケース（正式ルールで作られた保存値）を再計算せず表示
  const d = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 1101,
    subtotalExTax: 1001,
    taxAmount: 100,
  });
  assert.equal(d.source, "snapshot");
  assert.equal(d.subtotalExTax, 1001);
  assert.equal(d.taxAmount, 100);
  assert.equal(d.invoiceAmountInclusive, 1101);
  // 旧逆算なら floor(1101/1.1)=1000 になるが、スナップショットを優先
  assert.notEqual(d.subtotalExTax, Math.floor(1101 / 1.1));
  console.log("OK snapshot preferred over legacy reverse for fractional case");
}

{
  const d = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 1100,
    subtotalExTax: null,
    taxAmount: null,
  });
  assert.equal(d.source, "legacy_fallback");
  assert.equal(d.subtotalExTax, Math.floor(1100 / 1.1));
  assert.equal(d.taxAmount, 1100 - d.subtotalExTax);
  assert.equal(d.invoiceAmountInclusive, 1100);
  console.log("OK both NULL → legacy floor(/1.1) fallback");
}

{
  const d = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 1100,
    subtotalExTax: 1000,
    taxAmount: null,
  });
  assert.equal(d.source, "legacy_fallback");
  assert.equal(d.subtotalExTax, Math.floor(1100 / 1.1));
  console.log("OK partial NULL (tax only) → legacy fallback");
}

{
  const d = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 1100,
    subtotalExTax: null,
    taxAmount: 100,
  });
  assert.equal(d.source, "legacy_fallback");
  console.log("OK partial NULL (subtotal only) → legacy fallback");
}

{
  // スナップショットがあっても税込は invoice_amount を維持（再計算しない）
  const d = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 9999,
    subtotalExTax: 1000,
    taxAmount: 100,
  });
  assert.equal(d.source, "snapshot");
  assert.equal(d.invoiceAmountInclusive, 9999);
  assert.equal(d.subtotalExTax, 1000);
  assert.equal(d.taxAmount, 100);
  console.log("OK invoice_amount not recomputed from snapshot");
}

console.log("\nAll invoice print tax snapshot behavior checks passed");
