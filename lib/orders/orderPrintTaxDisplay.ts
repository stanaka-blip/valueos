/**
 * 発注書印刷の税表示（表示専用）。
 *
 * - DB の order_amount / order_items は税抜のまま変更しない
 * - 請求と同じ 10%・切捨ルールを発注書単位で1回だけ適用
 * - 明細ごとには課税しない
 */

import { calculateInvoiceAmountInclusive } from "@/lib/invoices/invoiceTax";

export type OrderPrintTaxDisplay = {
  /** 税抜小計（表示用） */
  subtotalExTax: number;
  /** 消費税（10%・切捨） */
  taxAmount: number;
  /** 税込合計 */
  totalInTax: number;
};

/**
 * 発注の税抜合計から印刷用の税抜・消費税・税込を算出する。
 * subtotalExTax は明細合計、またはレガシー時の orders.order_amount。
 */
export function buildOrderPrintTaxDisplay(
  subtotalExTax: number
): OrderPrintTaxDisplay {
  const breakdown = calculateInvoiceAmountInclusive(subtotalExTax);
  return {
    subtotalExTax: breakdown.subtotalExTax,
    taxAmount: breakdown.tax,
    totalInTax: breakdown.invoiceAmountInclusive,
  };
}
