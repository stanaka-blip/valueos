/**
 * 新規請求作成時の税スナップショット決定。
 * 案A: 手入力（invoice_amount 変更）時は税抜・税額を NULL のまま保存し、逆算しない。
 */

import type { InvoiceAmountAutofillResult } from "./invoiceAmountAutofill";
import { calculateInvoiceAmountInclusive } from "./invoiceTax";

export type InvoiceTaxSnapshotSave = {
  subtotal_ex_tax: number | null;
  tax_amount: number | null;
  invoice_amount: number;
  source: "autofill" | "manual";
};

/**
 * 保存用スナップショットを組み立てる。
 * - 未手入力かつ autofill 税込と入力値が一致 → 正式3点を保存
 * - それ以外（手入力・不一致・autofillなし）→ 税抜/税額は NULL
 */
export function buildInvoiceTaxSnapshotForSave(input: {
  invoiceAmountTouched: boolean;
  invoiceAmount: number;
  autofill: Pick<
    InvoiceAmountAutofillResult,
    "subtotalExTax" | "tax" | "invoiceAmountInclusive"
  > | null;
}): InvoiceTaxSnapshotSave {
  const invoiceAmount = Number.isFinite(input.invoiceAmount)
    ? Math.floor(input.invoiceAmount)
    : 0;

  if (input.invoiceAmountTouched) {
    return {
      subtotal_ex_tax: null,
      tax_amount: null,
      invoice_amount: invoiceAmount,
      source: "manual",
    };
  }

  const inclusive = input.autofill?.invoiceAmountInclusive;
  if (
    inclusive == null ||
    !Number.isFinite(inclusive) ||
    Math.floor(inclusive) !== invoiceAmount
  ) {
    return {
      subtotal_ex_tax: null,
      tax_amount: null,
      invoice_amount: invoiceAmount,
      source: "manual",
    };
  }

  const subtotal = Math.floor(input.autofill!.subtotalExTax);
  const expected = calculateInvoiceAmountInclusive(subtotal);
  if (
    expected.tax !== input.autofill!.tax ||
    expected.invoiceAmountInclusive !== invoiceAmount
  ) {
    return {
      subtotal_ex_tax: null,
      tax_amount: null,
      invoice_amount: invoiceAmount,
      source: "manual",
    };
  }

  return {
    subtotal_ex_tax: expected.subtotalExTax,
    tax_amount: expected.tax,
    invoice_amount: expected.invoiceAmountInclusive,
    source: "autofill",
  };
}
