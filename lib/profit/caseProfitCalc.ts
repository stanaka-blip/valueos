/**
 * 案件粗利 v1（純関数）。
 *
 * 確定粗利 = 税抜売上 − 税抜仕入原価 − 税抜決済手数料
 * 見込粗利 = Σ case_products.sales_price − Σ purchase_price − 手数料見込（参考）
 *
 * 請求額・入金額（債権/資金移動）は税込のまま保持し、粗利の売上には使わない。
 * 含めない: payments / finance_receipts / dealer_settlements.payout* / supplier_payments
 */

import { resolveInvoicePrintTaxDisplay } from "@/lib/invoices/invoicePrintTaxDisplay";

export type CaseProfitFeeInput = {
  feeAmount?: number | null;
  feeRate?: number | null;
};

export type CaseProfitInvoiceInput = {
  status?: string | null;
  /** 税込請求額（invoice_amount）。債権額として保持。粗利の売上には使わない */
  invoiceAmount?: number | string | null;
  /** 税抜売上スナップショット。無い場合は税込から floor(amount / 1.1) */
  subtotalExTax?: number | string | null;
  taxAmount?: number | string | null;
};

export type CaseProfitOrderInput = {
  status?: string | null;
  orderAmount?: number | string | null;
};

export type CaseProfitProductInput = {
  salesPrice?: number | null;
  purchasePrice?: number | null;
};

export type ConfirmedCaseProfit = {
  /** 売上（税抜） */
  revenue: number;
  /** 請求額（税込）合計。粗利の加減算には使わない */
  billedInclusive: number;
  /** 消費税合計 */
  tax: number;
  /** 仕入原価（税抜） */
  cost: number;
  /** 決済手数料（税抜） */
  fee: number;
  profit: number;
  /** 粗利率。分母は税抜売上 */
  rate: number | null;
};

export type ForecastCaseProfit = {
  revenue: number;
  cost: number;
  fee: number;
  profit: number;
  rate: number | null;
  /** 売価または仕入のいずれかが null の明細がある */
  hasUnsetPrices: boolean;
};

function toFiniteNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function floorMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value);
}

/** fee_amount（税抜）優先。なければ fee_rate % × 税抜売上 */
export function resolveCaseProfitFee(
  fee: CaseProfitFeeInput | null | undefined,
  revenueBase: number
): number {
  if (!fee) return 0;
  const amount = toFiniteNumber(fee.feeAmount);
  if (amount > 0) return floorMoney(amount);
  const rate = fee.feeRate;
  if (rate != null && Number.isFinite(Number(rate)) && Number(rate) > 0) {
    return floorMoney((toFiniteNumber(revenueBase) * Number(rate)) / 100);
  }
  return 0;
}

/** 有効請求1件の税区分。invoice_amount は税込のまま、売上は税抜 */
export function resolveInvoiceProfitTax(inv: CaseProfitInvoiceInput): {
  billedInclusive: number;
  subtotalExTax: number;
  tax: number;
} {
  const parts = resolveInvoicePrintTaxDisplay({
    invoiceAmount: inv.invoiceAmount,
    subtotalExTax: inv.subtotalExTax,
    taxAmount: inv.taxAmount,
  });
  return {
    billedInclusive: floorMoney(parts.invoiceAmountInclusive),
    subtotalExTax: floorMoney(parts.subtotalExTax),
    tax: floorMoney(parts.taxAmount),
  };
}

function isCancelledInvoice(inv: CaseProfitInvoiceInput): boolean {
  return String(inv.status || "").trim() === "取消";
}

/** 取消を除く 税抜売上 合計 */
export function sumActiveInvoiceRevenue(
  invoices: ReadonlyArray<CaseProfitInvoiceInput> | undefined
): number {
  if (!invoices) return 0;
  let sum = 0;
  for (const inv of invoices) {
    if (isCancelledInvoice(inv)) continue;
    sum += resolveInvoiceProfitTax(inv).subtotalExTax;
  }
  return sum;
}

/** 取消を除く 請求額（税込）合計。債権額。粗利加減算には使わない */
export function sumActiveInvoiceBilledInclusive(
  invoices: ReadonlyArray<CaseProfitInvoiceInput> | undefined
): number {
  if (!invoices) return 0;
  let sum = 0;
  for (const inv of invoices) {
    if (isCancelledInvoice(inv)) continue;
    sum += resolveInvoiceProfitTax(inv).billedInclusive;
  }
  return sum;
}

/** 取消を除く 消費税 合計 */
export function sumActiveInvoiceTax(
  invoices: ReadonlyArray<CaseProfitInvoiceInput> | undefined
): number {
  if (!invoices) return 0;
  let sum = 0;
  for (const inv of invoices) {
    if (isCancelledInvoice(inv)) continue;
    sum += resolveInvoiceProfitTax(inv).tax;
  }
  return sum;
}

/** キャンセルを除く orders.order_amount 合計（「取消」も除外） */
export function sumActiveOrderCost(
  orders: ReadonlyArray<CaseProfitOrderInput> | undefined
): number {
  if (!orders) return 0;
  let sum = 0;
  for (const order of orders) {
    const status = String(order.status || "").trim();
    if (status === "キャンセル" || status === "取消") continue;
    sum += floorMoney(toFiniteNumber(order.orderAmount));
  }
  return sum;
}

/**
 * 確定粗利（通常・3社間共通）。税抜基準。
 * CF 台帳（payments / finance_receipts / dealer payout / supplier_payments）は引数に取らない。
 */
export function computeConfirmedCaseProfit(input: {
  invoices: ReadonlyArray<CaseProfitInvoiceInput>;
  orders: ReadonlyArray<CaseProfitOrderInput>;
  fee?: CaseProfitFeeInput | null;
}): ConfirmedCaseProfit {
  const revenue = sumActiveInvoiceRevenue(input.invoices);
  const billedInclusive = sumActiveInvoiceBilledInclusive(input.invoices);
  const tax = sumActiveInvoiceTax(input.invoices);
  const cost = sumActiveOrderCost(input.orders);
  const fee = resolveCaseProfitFee(input.fee, revenue);
  const profit = revenue - cost - fee;
  const rate = revenue > 0 ? (profit / revenue) * 100 : null;
  return { revenue, billedInclusive, tax, cost, fee, profit, rate };
}

/** 見込粗利（参考）。null 価格は合計に 0 加算するが hasUnsetPrices で区別する */
export function computeForecastCaseProfit(input: {
  products: ReadonlyArray<CaseProfitProductInput>;
  fee?: CaseProfitFeeInput | null;
}): ForecastCaseProfit {
  let revenue = 0;
  let cost = 0;
  let hasUnsetPrices = false;

  for (const p of input.products) {
    if (p.salesPrice == null || p.purchasePrice == null) {
      hasUnsetPrices = true;
    }
    if (p.salesPrice != null && Number.isFinite(Number(p.salesPrice))) {
      revenue += Number(p.salesPrice);
    }
    if (p.purchasePrice != null && Number.isFinite(Number(p.purchasePrice))) {
      cost += Number(p.purchasePrice);
    }
  }

  revenue = floorMoney(revenue);
  cost = floorMoney(cost);
  const fee = resolveCaseProfitFee(input.fee, revenue);
  const profit = revenue - cost - fee;
  const rate = revenue > 0 ? (profit / revenue) * 100 : null;
  return { revenue, cost, fee, profit, rate, hasUnsetPrices };
}
