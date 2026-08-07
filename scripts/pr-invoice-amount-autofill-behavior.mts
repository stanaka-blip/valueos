/**
 * PR #91 Phase A: 請求金額オートフィル（マスタ価格→税込）挙動テスト
 * Run: npx tsx scripts/pr-invoice-amount-autofill-behavior.mts
 */
import assert from "node:assert/strict";

import {
  UNSET_PRICE_LABEL,
  UNSET_PRICE_WARNING,
  buildInvoiceAmountAutofill,
  lineTotalExTaxFromUnit,
  resolveLineFromLookup,
  type InvoiceLineForAutofill,
  type ResolvedInvoiceLinePrice,
} from "../lib/invoices/invoiceAmountAutofill.ts";
import { calculateInvoiceAmountInclusive } from "../lib/invoices/invoiceTax.ts";
import { roundMoneyTotal } from "../lib/salesPrices.ts";

function line(
  partial: Partial<InvoiceLineForAutofill> & { id: string }
): InvoiceLineForAutofill {
  return {
    lineType: "PRODUCT",
    productId: "p1",
    packageId: null,
    quantity: 1,
    label: "商品",
    ...partial,
  };
}

console.log("OK tax helpers loaded");

{
  const r = calculateInvoiceAmountInclusive(1000);
  assert.equal(r.subtotalExTax, 1000);
  assert.equal(r.tax, 100);
  assert.equal(r.invoiceAmountInclusive, 1100);
  console.log("OK tax: 1000 ex → tax 100 → 1100 incl");
}

{
  // 切り捨て: 1001 * 0.1 = 100.1 → 100
  const r = calculateInvoiceAmountInclusive(1001);
  assert.equal(r.tax, 100);
  assert.equal(r.invoiceAmountInclusive, 1101);
  console.log("OK tax floor for fractional yen");
}

{
  const r = calculateInvoiceAmountInclusive(0);
  assert.equal(r.invoiceAmountInclusive, 0);
  assert.equal(r.tax, 0);
  console.log("OK zero subtotal");
}

{
  // PRODUCT: unit 1000 × qty 2
  assert.equal(roundMoneyTotal(1000, 2), 2000);
  assert.equal(lineTotalExTaxFromUnit(1000, 2), 2000);
  const resolved = resolveLineFromLookup({
    line: line({ id: "1", quantity: 2, productId: "prod" }),
    found: true,
    unitPrice: 1000,
    lookupError: null,
  });
  assert.equal(resolved.status, "priced");
  assert.equal(resolved.lineTotalExTax, 2000);
  const autofill = buildInvoiceAmountAutofill([resolved]);
  assert.equal(autofill.subtotalExTax, 2000);
  assert.equal(autofill.tax, 200);
  assert.equal(autofill.invoiceAmountInclusive, 2200);
  assert.equal(autofill.hasUnsetPrices, false);
  console.log("OK PRODUCT qty reflected + invoice-level tax");
}

{
  // PACKAGE: formal package unit, not component sum
  const resolved = resolveLineFromLookup({
    line: line({
      id: "pkg",
      lineType: "PACKAGE",
      productId: null,
      packageId: "pack-1",
      quantity: 3,
      label: "パッケージ",
    }),
    found: true,
    unitPrice: 50000,
    lookupError: null,
  });
  assert.equal(resolved.lineTotalExTax, 150000);
  const autofill = buildInvoiceAmountAutofill([resolved]);
  assert.equal(autofill.invoiceAmountInclusive, 165000);
  console.log("OK PACKAGE uses package unit price × qty");
}

{
  // Multiple lines: tax once on sum
  const lines: ResolvedInvoiceLinePrice[] = [
    resolveLineFromLookup({
      line: line({ id: "a", quantity: 1 }),
      found: true,
      unitPrice: 1000,
      lookupError: null,
    }),
    resolveLineFromLookup({
      line: line({
        id: "b",
        lineType: "PACKAGE",
        productId: null,
        packageId: "pk",
        quantity: 1,
      }),
      found: true,
      unitPrice: 500,
      lookupError: null,
    }),
  ];
  // If taxed per line: floor(1000*0.1)+floor(500*0.1)=100+50=150
  // Invoice-level: floor(1500*0.1)=150 — same here; use amounts that diverge
  const lines2: ResolvedInvoiceLinePrice[] = [
    resolveLineFromLookup({
      line: line({ id: "a", quantity: 1 }),
      found: true,
      unitPrice: 14,
      lookupError: null,
    }),
    resolveLineFromLookup({
      line: line({ id: "b", quantity: 1, productId: "p2" }),
      found: true,
      unitPrice: 14,
      lookupError: null,
    }),
  ];
  // per-line: floor(1.4)+floor(1.4)=1+1=2; invoice-level: floor(2.8)=2 — still same
  // Use 15+15: per-line floor(1.5)*2=1+1=2; sum 30 floor(3)=3 — DIVERGES
  const lines3: ResolvedInvoiceLinePrice[] = [
    resolveLineFromLookup({
      line: line({ id: "a", quantity: 1 }),
      found: true,
      unitPrice: 15,
      lookupError: null,
    }),
    resolveLineFromLookup({
      line: line({ id: "b", quantity: 1, productId: "p2" }),
      found: true,
      unitPrice: 15,
      lookupError: null,
    }),
  ];
  const autofill = buildInvoiceAmountAutofill(lines3);
  assert.equal(autofill.subtotalExTax, 30);
  assert.equal(autofill.tax, 3); // floor(30*0.1)=3, NOT 1+1=2
  assert.equal(autofill.invoiceAmountInclusive, 33);
  console.log("OK multi-line: tax computed once on combined subtotal");
  void lines;
  void lines2;
}

{
  const unset = resolveLineFromLookup({
    line: line({ id: "u" }),
    found: false,
    unitPrice: 0,
    lookupError: null,
  });
  assert.equal(unset.status, "unset");
  assert.equal(unset.lineTotalExTax, null);

  const priced = resolveLineFromLookup({
    line: line({ id: "p", productId: "ok" }),
    found: true,
    unitPrice: 1000,
    lookupError: null,
  });

  const autofill = buildInvoiceAmountAutofill([unset, priced]);
  assert.equal(autofill.hasUnsetPrices, true);
  assert.equal(autofill.unsetCount, 1);
  assert.equal(autofill.subtotalExTax, 1000); // unset excluded
  assert.equal(autofill.invoiceAmountInclusive, 1100);
  assert.equal(UNSET_PRICE_LABEL, "販売価格未設定");
  assert.match(UNSET_PRICE_WARNING, /販売価格未設定の商品があります/);
  console.log("OK unset excluded from total; not treated as zero");
}

{
  const onlyUnset = buildInvoiceAmountAutofill([
    resolveLineFromLookup({
      line: line({ id: "u" }),
      found: false,
      unitPrice: 0,
      lookupError: null,
    }),
  ]);
  assert.equal(onlyUnset.invoiceAmountInclusive, null);
  assert.equal(onlyUnset.hasUnsetPrices, true);
  console.log("OK all-unset → no invoice amount autofill");
}

console.log("\nAll invoice amount autofill behavior checks passed");
