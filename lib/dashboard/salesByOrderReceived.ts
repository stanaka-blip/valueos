/**
 * 売上・実粗利の期間集計（受注日基準）
 *
 * - 金額の元データ: case_products.sales_price / gross_profit
 * - 期間判定: cases.order_received_date（顧客受注日）
 * - case_products.created_at / orders.order_date は使わない
 */

import { sumSalesAndProfit } from "@/lib/dashboard/salesMetrics";
import {
  enumerateBuckets,
  isDateInRange,
  periodBucketKey,
  type DashboardPeriod,
} from "@/lib/dashboard/period";
import { isActiveCaseStatus } from "@/lib/status/activeRecords";

export type CaseForSales = {
  id: string;
  status?: string | null;
  order_received_date?: string | null;
};

export type ProductForSales = {
  case_id?: string | null;
  sales_price?: number | string | null;
  gross_profit?: number | string | null;
};

export type SalesAggregateResult = {
  sales: number;
  profit: number;
  profitRate: number;
  periodCaseIds: string[];
  trend: {
    key: string;
    label: string;
    sales: number;
    profit: number;
  }[];
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 期間内の受注案件に紐づく商品を集計する。
 * キャンセル案件は除外。
 */
export function aggregateSalesByOrderReceived(input: {
  cases: readonly CaseForSales[];
  products: readonly ProductForSales[];
  period: Pick<DashboardPeriod, "from" | "to" | "grain">;
}): SalesAggregateResult {
  const activePeriodCases = input.cases.filter((c) => {
    if (!isActiveCaseStatus(c.status)) return false;
    return isDateInRange(c.order_received_date, input.period.from, input.period.to);
  });

  const periodCaseIds = activePeriodCases.map((c) => c.id);
  const caseIdSet = new Set(periodCaseIds);
  const orderDateByCase = new Map(
    activePeriodCases.map((c) => [c.id, c.order_received_date || null])
  );

  const periodProducts = input.products.filter((p) =>
    caseIdSet.has((p.case_id as string) || "")
  );
  const { sales, profit, profitRate } = sumSalesAndProfit(periodProducts);

  const buckets = enumerateBuckets(
    input.period.from,
    input.period.to,
    input.period.grain
  );
  const salesMap = new Map<string, number>(buckets.map((k) => [k, 0]));
  const profitMap = new Map<string, number>(buckets.map((k) => [k, 0]));

  for (const p of periodProducts) {
    const caseId = (p.case_id as string) || "";
    const received = orderDateByCase.get(caseId);
    const key = periodBucketKey(received, input.period.grain);
    if (!key || !salesMap.has(key)) continue;
    salesMap.set(key, (salesMap.get(key) || 0) + toNumber(p.sales_price));
    profitMap.set(key, (profitMap.get(key) || 0) + toNumber(p.gross_profit));
  }

  const trend = buckets.map((key) => ({
    key,
    label:
      input.period.grain === "month" ? key.replace("-", "/") : key.slice(5),
    sales: salesMap.get(key) || 0,
    profit: profitMap.get(key) || 0,
  }));

  return { sales, profit, profitRate, periodCaseIds, trend };
}
