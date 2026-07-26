import { loadWorkflowAlertCaseIds } from "@/lib/dashboard/caseAlerts";
import {
  resolvePeriod,
  type DashboardPeriod,
  type PeriodPreset,
} from "@/lib/dashboard/period";
import { aggregateSalesByOrderReceived } from "@/lib/dashboard/salesByOrderReceived";
import { summarizeInvoicePayments } from "@/lib/payments/invoicePaymentStatus";
import { isActiveInvoiceStatus } from "@/lib/status/activeRecords";
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
  /** 未入金件数（請求単位: paymentStatus が 未入金 or 一部入金） */
  unpaidInvoiceCount: number;
  /** 期限超過件数（請求単位: isOverdue） */
  overdueInvoiceCount: number;
  unorderedCaseIds: string[];
  uninvoicedCaseIds: string[];
};

export type DashboardData = {
  period: DashboardPeriod;
  kpis: DashboardKpis;
  alerts: DashboardAlerts;
  trend: TrendPoint[];
  /** KPI → 案件一覧用（期間内受注の案件） */
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
    { data: caseRows, error: casesError },
    { data: productRows, error: productsError },
    { data: invoiceRows, error: invoicesError },
    { data: paymentRows, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select("id, status, order_received_date"),
    supabase
      .from("case_products")
      .select("id, case_id, sales_price, purchase_price, gross_profit"),
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
    casesError?.message ||
    productsError?.message ||
    invoicesError?.message ||
    paymentsError?.message ||
    null;

  if (error) {
    return emptyDashboard(period, error);
  }

  const cases = caseRows || [];
  const products = productRows || [];
  const invoices = invoiceRows || [];
  const payments = paymentRows || [];

  // --- KPI / 推移: 顧客受注日 cases.order_received_date 基準 ---
  const salesAgg = aggregateSalesByOrderReceived({
    cases: cases.map((c) => ({
      id: c.id as string,
      status: (c.status as string) || null,
      order_received_date: (c.order_received_date as string) || null,
    })),
    products: products.map((p) => ({
      case_id: (p.case_id as string) || null,
      sales_price: p.sales_price as number | string | null,
      gross_profit: p.gross_profit as number | string | null,
    })),
    period,
  });

  // --- 未入金額 / アラート用: summarizeInvoicePayments（現在時点・期間非連動） ---
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
    if (!isActiveInvoiceStatus(inv.status as string)) continue;
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

  const alertIds = await loadWorkflowAlertCaseIds();
  if (alertIds.error) {
    return emptyDashboard(period, alertIds.error);
  }

  return {
    period,
    kpis: {
      sales: salesAgg.sales,
      profit: salesAgg.profit,
      profitRate: salesAgg.profitRate,
      unpaidAmount,
    },
    alerts: {
      unorderedCount: alertIds.unorderedCaseIds.length,
      uninvoicedCount: alertIds.uninvoicedCaseIds.length,
      unpaidInvoiceCount,
      overdueInvoiceCount,
      unorderedCaseIds: alertIds.unorderedCaseIds,
      uninvoicedCaseIds: alertIds.uninvoicedCaseIds,
    },
    trend: salesAgg.trend,
    periodCaseIds: salesAgg.periodCaseIds,
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
