/**
 * PR #92: 請求税スナップショット挙動テスト
 * Run: npx tsx scripts/pr-invoice-tax-snapshot-behavior.mts
 */
import assert from "node:assert/strict";

import { buildInvoiceAmountAutofill } from "../lib/invoices/invoiceAmountAutofill.ts";
import { calculateInvoiceAmountInclusive } from "../lib/invoices/invoiceTax.ts";
import { buildInvoiceTaxSnapshotForSave } from "../lib/invoices/invoiceTaxSnapshot.ts";
import { resolveLineFromLookup } from "../lib/invoices/invoiceAmountAutofill.ts";

{
  const b = calculateInvoiceAmountInclusive(1000);
  assert.equal(b.tax, 100);
  assert.equal(b.invoiceAmountInclusive, 1100);
  console.log("OK formal tax 1000 → 1100");
}

{
  const b = calculateInvoiceAmountInclusive(1001);
  assert.equal(b.tax, 100);
  assert.equal(b.invoiceAmountInclusive, 1101);
  console.log("OK floor tax for 1001");
}

{
  const line = resolveLineFromLookup({
    line: {
      id: "1",
      lineType: "PRODUCT",
      productId: "p",
      packageId: null,
      quantity: 2,
      label: "x",
    },
    found: true,
    unitPrice: 1000,
    lookupError: null,
  });
  const autofill = buildInvoiceAmountAutofill([line]);
  assert.equal(autofill.invoiceAmountInclusive, 2200);

  const snap = buildInvoiceTaxSnapshotForSave({
    invoiceAmountTouched: false,
    invoiceAmount: 2200,
    autofill,
  });
  assert.equal(snap.source, "autofill");
  assert.equal(snap.subtotal_ex_tax, 2000);
  assert.equal(snap.tax_amount, 200);
  assert.equal(snap.invoice_amount, 2200);
  assert.equal(snap.subtotal_ex_tax! + snap.tax_amount!, snap.invoice_amount);
  console.log("OK autofill save writes 3 consistent amounts");
}

{
  const autofill = buildInvoiceAmountAutofill([
    resolveLineFromLookup({
      line: {
        id: "1",
        lineType: "PRODUCT",
        productId: "p",
        packageId: null,
        quantity: 1,
        label: "x",
      },
      found: true,
      unitPrice: 1000,
      lookupError: null,
    }),
  ]);

  const snap = buildInvoiceTaxSnapshotForSave({
    invoiceAmountTouched: true,
    invoiceAmount: 9999,
    autofill,
  });
  assert.equal(snap.source, "manual");
  assert.equal(snap.subtotal_ex_tax, null);
  assert.equal(snap.tax_amount, null);
  assert.equal(snap.invoice_amount, 9999);
  console.log("OK manual edit → tax snapshot NULL (no reverse calc)");
}

{
  const snap = buildInvoiceTaxSnapshotForSave({
    invoiceAmountTouched: false,
    invoiceAmount: 5000,
    autofill: {
      subtotalExTax: 1000,
      tax: 100,
      invoiceAmountInclusive: 1100,
    },
  });
  assert.equal(snap.source, "manual");
  assert.equal(snap.subtotal_ex_tax, null);
  assert.equal(snap.tax_amount, null);
  assert.equal(snap.invoice_amount, 5000);
  console.log("OK amount mismatch vs autofill → treat as manual");
}

{
  const snap = buildInvoiceTaxSnapshotForSave({
    invoiceAmountTouched: false,
    invoiceAmount: 1100,
    autofill: null,
  });
  assert.equal(snap.subtotal_ex_tax, null);
  assert.equal(snap.tax_amount, null);
  console.log("OK no autofill → NULL snapshot columns");
}

console.log("\nAll invoice tax snapshot behavior checks passed");
