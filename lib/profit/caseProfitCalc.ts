/**
 * 案件粗利 v1（純関数）。
 *
 * 確定粗利 = 有効請求合計 − 有効発注合計 − 決済手数料
 * 見込粗利 = Σ case_products.sales_price − Σ purchase_price − 手数料見込（参考）
 *
 * 含めない: payments / finance_receipts / dealer_settlements.payout* / supplier_payments
 */

export type CaseProfitFeeInput = {
  feeAmount?: number | null;
  feeRate?: number | null;
};

export type CaseProfitInvoiceInput = {
  status?: string | null;
  invoiceAmount?: number | string | null;
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
  revenue: number;
  cost: number;
  fee: number;
  profit: number;
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

/** fee_amount 優先。なければ fee_rate % × base（売上） */
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

/** 取消を除く invoices.invoice_amount 合計 */
export function sumActiveInvoiceRevenue(
  invoices: ReadonlyArray<CaseProfitInvoiceInput> | undefined
): number {
  if (!invoices) return 0;
  let sum = 0;
  for (const inv of invoices) {
    if (String(inv.status || "").trim() === "取消") continue;
    sum += floorMoney(toFiniteNumber(inv.invoiceAmount));
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
 * 確定粗利（通常・3社間共通）。
 * CF 台帳（payments / finance_receipts / dealer payout / supplier_payments）は引数に取らない。
 */
export function computeConfirmedCaseProfit(input: {
  invoices: ReadonlyArray<CaseProfitInvoiceInput>;
  orders: ReadonlyArray<CaseProfitOrderInput>;
  fee?: CaseProfitFeeInput | null;
}): ConfirmedCaseProfit {
  const revenue = sumActiveInvoiceRevenue(input.invoices);
  const cost = sumActiveOrderCost(input.orders);
  const fee = resolveCaseProfitFee(input.fee, revenue);
  const profit = revenue - cost - fee;
  const rate = revenue > 0 ? (profit / revenue) * 100 : null;
  return { revenue, cost, fee, profit, rate };
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
