/**
 * 既存ダッシュボードと同じ売上・実粗利集計。
 * case_products.sales_price / gross_profit の合計のみ。
 *
 * 期間基準日:
 * - case_products に存在する日付カラムは created_at のみ
 * - 売上計上日専用カラム（sales_date 等）は未定義
 * - よって期間フィルタは case_products.created_at（明細登録日）を採用
 */

export type ProductAmountRow = {
  sales_price?: number | string | null;
  purchase_price?: number | string | null;
  gross_profit?: number | string | null;
  created_at?: string | null;
  case_id?: string | null;
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 既存 Home と同じ: Σ sales_price / Σ gross_profit / 粗利率 */
export function sumSalesAndProfit(products: readonly ProductAmountRow[]): {
  sales: number;
  profit: number;
  profitRate: number;
} {
  const sales = products.reduce(
    (sum, item) => sum + toNumber(item.sales_price),
    0
  );
  const profit = products.reduce(
    (sum, item) => sum + toNumber(item.gross_profit),
    0
  );
  const profitRate = sales > 0 ? (profit / sales) * 100 : 0;
  return { sales, profit, profitRate };
}
