/**
 * 請求書印刷の税抜・消費税表示。
 *
 * - subtotal_ex_tax と tax_amount が両方 non-null → 保存値をそのまま表示
 * - どちらかが NULL → 現行互換: floor(invoice_amount / 1.1)
 * - invoice_amount（税込）は呼び出し側で正式値として維持
 * - スナップショットから再計算・推測しない
 */

export type InvoicePrintTaxDisplay = {
  subtotalExTax: number;
  taxAmount: number;
  invoiceAmountInclusive: number;
  source: "snapshot" | "legacy_fallback";
};

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveInvoicePrintTaxDisplay(input: {
  invoiceAmount: number | string | null | undefined;
  subtotalExTax: number | string | null | undefined;
  taxAmount: number | string | null | undefined;
}): InvoicePrintTaxDisplay {
  const invoiceAmountInclusive = toFiniteNumber(input.invoiceAmount) ?? 0;
  const subtotalExTax = toFiniteNumber(input.subtotalExTax);
  const taxAmount = toFiniteNumber(input.taxAmount);

  if (subtotalExTax !== null && taxAmount !== null) {
    return {
      subtotalExTax,
      taxAmount,
      invoiceAmountInclusive,
      source: "snapshot",
    };
  }

  const legacySubtotal = Math.floor(invoiceAmountInclusive / 1.1);
  return {
    subtotalExTax: legacySubtotal,
    taxAmount: invoiceAmountInclusive - legacySubtotal,
    invoiceAmountInclusive,
    source: "legacy_fallback",
  };
}
