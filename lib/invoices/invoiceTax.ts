/**
 * ValueOS 請求税ルール（正式）
 *
 * - 税率 10% のみ
 * - sales_prices / 販売金額合計は税抜
 * - invoice_amount は税込
 * - 明細ごとには課税せず、請求書単位で1回だけ消費税を計算
 * - 消費税の1円未満は切り捨て: tax = Math.floor(subtotal_ex_tax * 0.10)
 *
 * 請求書印刷は resolveInvoicePrintTaxDisplay を使う。
 * スナップショット列（subtotal_ex_tax / tax_amount）があれば保存値、
 * 無ければ floor(invoice_amount / 1.1)。invoice_amount（税込）は変更しない。
 * 粗利の売上はこの税抜額を使う。
 */

export const INVOICE_CONSUMPTION_TAX_RATE = 0.1;

export type InvoiceTaxBreakdown = {
  /** 税抜合計 */
  subtotalExTax: number;
  /** 消費税（切り捨て） */
  tax: number;
  /** 税込（invoice_amount 初期値） */
  invoiceAmountInclusive: number;
};

/**
 * 税抜合計から請求税込金額を算出する。
 * 明細単位では呼ばないこと（請求書単位の合計に対して1回だけ）。
 */
export function calculateInvoiceAmountInclusive(
  subtotalExTax: number
): InvoiceTaxBreakdown {
  const safeSubtotal =
    Number.isFinite(subtotalExTax) && subtotalExTax > 0
      ? Math.floor(subtotalExTax)
      : 0;
  const tax = Math.floor(safeSubtotal * INVOICE_CONSUMPTION_TAX_RATE);
  return {
    subtotalExTax: safeSubtotal,
    tax,
    invoiceAmountInclusive: safeSubtotal + tax,
  };
}
