import { loadWorkflowAlertCaseIds } from "@/lib/dashboard/caseAlerts";
import {
  enumerateBuckets,
  isDateInRange,
  periodBucketKey,
  resolvePeriod,
  type DashboardPeriod,
  type PeriodPreset,
} from "@/lib/dashboard/period";
import { sumSalesAndProfit } from "@/lib/dashboard/salesMetrics";
import { summarizeInvoicePayments } from "@/lib/payments/invoicePaymentStatus";
import { supabase } from "@/lib/supabase";

export type TrendPoint = {
  key: string;
  label: string;
  sales: number;
  profit: number;
};

export type DashboardKpis = {
  sales: number;
  profit: number;
  profitRate: number;
  /** 現在時点の未回収残高（期間非連動） */
  unpaidAmount: number;
};

export type DashboardAlerts = {
  unorderedCount: number;
  uninvoicedCount: number;
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  unorderedCaseIds: string[];
  uninvoicedCaseIds: string[];
};

export type DashboardData = {
  period: DashboardPeriod;
  kpis: DashboardKpis;
  alerts: DashboardAlerts;
  trend: TrendPoint[];
  /** KPI → 案件一覧用（期間内に売上商品がある案件） */
  periodCaseIds: string[];
  error: string | null;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function loadDashboard(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<DashboardData> {
  const period = resolvePeriod({
    preset: input.preset,
    from: input.from,
    to: input.to,
  });

  const [
    { data: productRows, error: productsError },
    { data: invoiceRows, error: invoicesError },
    { data: paymentRows, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("case_products")
      .select("id, case_id, created_at, sales_price, purchase_price, gross_profit"),
    supabase
      .from("invoices")
      .select(
        "id, case_id, invoice_amount, due_date, status, invoice_date, created_at"
      ),
    supabase
      .from("payments")
      .select("id, case_id, invoice_id, payment_amount, status, payment_date"),
  ]);

  const error =
    productsError?.message ||
    invoicesError?.message ||
    paymentsError?.message ||
    null;

  if (error) {
    return emptyDashboard(period, error);
  }

  const products = productRows || [];
  const invoices = invoiceRows || [];
  const payments = paymentRows || [];

  // --- KPI: 期間内売上・実粗利（既存 case_products 合計） ---
  const periodProducts = products.filter((p) =>
    isDateInRange(p.created_at as string, period.from, period.to)
  );
  const { sales, profit, profitRate } = sumSalesAndProfit(periodProducts);
  const periodCaseIds = [
    ...new Set(
      periodProducts
        .map((p) => p.case_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  // --- 未入金額 / アラート用: summarizeInvoicePayments（現在時点） ---
  const paymentsByInvoice = new Map<string, typeof payments>();
  for (const p of payments) {
    const invId = p.invoice_id as string | null;
    if (!invId) continue;
    const list = paymentsByInvoice.get(invId) || [];
    list.push(p);
    paymentsByInvoice.set(invId, list);
  }

  let unpaidAmount = 0;
  let unpaidInvoiceCount = 0;
  let overdueInvoiceCount = 0;

  for (const inv of invoices) {
    if ((inv.status as string) === "取消") continue;
    const invPayments = paymentsByInvoice.get(inv.id as string) || [];
    const summary = summarizeInvoicePayments({
      invoiceAmount: inv.invoice_amount as number,
      dueDate: (inv.due_date as string) || null,
      payments: invPayments.map((p) => ({
        paymentAmount: toNumber(p.payment_amount),
        status: (p.status as string) || null,
      })),
    });
    unpaidAmount += summary.unpaidAmount;
    // paymentStatus ベース: 未入金・一部入金（未回収あり）
    if (
      summary.paymentStatus === "未入金" ||
      summary.paymentStatus === "一部入金"
    ) {
      unpaidInvoiceCount += 1;
    }
    if (summary.isOverdue) {
      overdueInvoiceCount += 1;
    }
  }

  // --- 業務アラート: WorkflowEngine.canOrder / canInvoice ---
  const alertIds = await loadWorkflowAlertCaseIds();
  if (alertIds.error) {
    return emptyDashboard(period, alertIds.error);
  }
  const unorderedCaseIds = alertIds.unorderedCaseIds;
  const uninvoicedCaseIds = alertIds.uninvoicedCaseIds;

  // --- 売上推移 ---
  const buckets = enumerateBuckets(period.from, period.to, period.grain);
  const salesMap = new Map<string, number>();
  const profitMap = new Map<string, number>();
  for (const key of buckets) {
    salesMap.set(key, 0);
    profitMap.set(key, 0);
  }
  for (const p of periodProducts) {
    const key = periodBucketKey(p.created_at as string, period.grain);
    if (!key || !salesMap.has(key)) continue;
    salesMap.set(key, (salesMap.get(key) || 0) + toNumber(p.sales_price));
    profitMap.set(key, (profitMap.get(key) || 0) + toNumber(p.gross_profit));
  }

  const trend: TrendPoint[] = buckets.map((key) => ({
    key,
    label: period.grain === "month" ? key.replace("-", "/") : key.slice(5),
    sales: salesMap.get(key) || 0,
    profit: profitMap.get(key) || 0,
  }));

  return {
    period,
    kpis: {
      sales,
      profit,
      profitRate,
      unpaidAmount,
    },
    alerts: {
      unorderedCount: unorderedCaseIds.length,
      uninvoicedCount: uninvoicedCaseIds.length,
      unpaidInvoiceCount,
      overdueInvoiceCount,
      unorderedCaseIds,
      uninvoicedCaseIds,
    },
    trend,
    periodCaseIds,
    error: null,
  };
}

function emptyDashboard(period: DashboardPeriod, error: string): DashboardData {
  return {
    period,
    kpis: { sales: 0, profit: 0, profitRate: 0, unpaidAmount: 0 },
    alerts: {
      unorderedCount: 0,
      uninvoicedCount: 0,
      unpaidInvoiceCount: 0,
      overdueInvoiceCount: 0,
      unorderedCaseIds: [],
      uninvoicedCaseIds: [],
    },
    trend: [],
    periodCaseIds: [],
    error,
  };
}

export function parseDashboardSearchParams(params: {
  preset?: string;
  from?: string;
  to?: string;
}): { preset: PeriodPreset | string; from?: string; to?: string } {
  return {
    preset: params.preset || "this_month",
    from: params.from,
    to: params.to,
  };
}
