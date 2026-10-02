/**
 * 案件詳細上部の金額サマリー。
 * 粗利・仕入は computeConfirmedCaseProfit と同じ契約を再利用する。
 * 請求予定金額は有効請求がある場合のみ実績税込（商品マスタ売価は使わない）。
 */

import {
  computeConfirmedCaseProfit,
  type CaseProfitFeeInput,
  type CaseProfitInvoiceInput,
  type CaseProfitOrderInput,
  type ConfirmedCaseProfit,
} from "@/lib/profit/caseProfitCalc";

export type CaseAmountSummaryInput = {
  invoices: ReadonlyArray<CaseProfitInvoiceInput>;
  orders: ReadonlyArray<CaseProfitOrderInput>;
  fee?: CaseProfitFeeInput | null;
};

export type CaseAmountSummary = {
  confirmed: ConfirmedCaseProfit;
  /** 取消以外の請求が1件以上ある */
  hasActiveInvoices: boolean;
  /**
   * 請求予定金額（税込）。
   * 有効請求あり → 最終請求額（税込）合計。
   * 未請求 → null（マスタ売価では埋めない）。
   */
  plannedInvoiceInclusive: number | null;
  /** 仕入れ値（税抜）= 確定仕入原価 */
  purchaseCostExTax: number;
  /** 粗利（税抜）= 確定粗利 */
  profitExTax: number;
  /** 確定粗利率（分母=税抜売上） */
  profitRate: number | null;
};

function hasActiveInvoice(
  invoices: ReadonlyArray<CaseProfitInvoiceInput>
): boolean {
  return invoices.some((inv) => String(inv.status || "").trim() !== "取消");
}

export function buildCaseAmountSummary(
  input: CaseAmountSummaryInput
): CaseAmountSummary {
  const confirmed = computeConfirmedCaseProfit(input);
  const active = hasActiveInvoice(input.invoices);
  return {
    confirmed,
    hasActiveInvoices: active,
    plannedInvoiceInclusive: active ? confirmed.billedInclusive : null,
    purchaseCostExTax: confirmed.cost,
    profitExTax: confirmed.profit,
    profitRate: confirmed.rate,
  };
}
