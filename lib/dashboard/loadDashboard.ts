import { loadWorkflowAlertCaseIds } from "@/lib/dashboard/caseAlerts";
import { aggregateDashboardV1 } from "@/lib/dashboard/aggregateDashboardV1";
import { summarizeDashboardInvoiceUnpaid } from "@/lib/dashboard/invoiceUnpaid";
import {
  resolvePeriod,
  type DashboardPeriod,
  type PeriodPreset,
} from "@/lib/dashboard/period";
import { isActiveInvoiceStatus } from "@/lib/status/activeRecords";
import { supabase } from "@/lib/supabase";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

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
  /** 未入金件数（請求単位） */
  unpaidInvoiceCount: number;
  /** 期限超過件数（請求単位。3社間は顧客 due では数えない） */
  overdueInvoiceCount: number;
  unorderedCaseIds: string[];
  uninvoicedCaseIds: string[];
};

export type DashboardData = {
  period: DashboardPeriod;
  kpis: DashboardKpis;
  alerts: DashboardAlerts;
  trend: TrendPoint[];
  /** KPI → 期間内に請求がある案件 */
  periodCaseIds: string[];
  error: string | null;
};

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
    { data: invoiceRows, error: invoicesError },
    { data: orderRows, error: ordersError },
    { data: paymentRows, error: paymentsError },
  ] = await Promise.all([
    supabase.from("cases").select("id, status"),
    supabase
      .from("invoices")
      .select(
        "id, case_id, invoice_amount, subtotal_ex_tax, tax_amount, due_date, status, invoice_date, created_at"
      ),
    supabase.from("orders").select("id, case_id, status, order_amount"),
    supabase
      .from("payments")
      .select("id, case_id, invoice_id, payment_amount, status, payment_date"),
  ]);

  const publicError =
    casesError?.message ||
    invoicesError?.message ||
    ordersError?.message ||
    paymentsError?.message ||
    null;

  if (publicError) {
    return emptyDashboard(period, publicError);
  }

  let settlementRows: Array<{
    case_id: string | null;
    settlement_type: string | null;
    fee_amount: number | string | null;
    fee_rate: number | string | null;
  }> = [];
  let financeRows: Array<{
    case_id: string | null;
    status: string | null;
    actual_amount: number | string | null;
    scheduled_amount: number | string | null;
  }> = [];
  let dealerRows: Array<{
    case_id: string | null;
    status: string | null;
    actual_payout_amount: number | string | null;
    payout_amount: number | string | null;
  }> = [];

  try {
    const admin = getServiceRoleSupabase();
    const [settlementsRes, financeRes, dealerRes] = await Promise.all([
      admin
        .from("case_settlements")
        .select("case_id, settlement_type, fee_amount, fee_rate"),
      admin
        .from("finance_receipts")
        .select("case_id, status, actual_amount, scheduled_amount"),
      admin
        .from("dealer_settlements")
        .select("case_id, status, actual_payout_amount, payout_amount"),
    ]);
    const adminError =
      settlementsRes.error?.message ||
      financeRes.error?.message ||
      dealerRes.error?.message ||
      null;
    if (adminError) {
      return emptyDashboard(period, adminError);
    }
    settlementRows = (settlementsRes.data || []) as typeof settlementRows;
    financeRows = (financeRes.data || []) as typeof financeRows;
    dealerRows = (dealerRes.data || []) as typeof dealerRows;
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return emptyDashboard(period, "サーバー設定が完了していません");
    }
    return emptyDashboard(period, "決済・3社間情報の取得に失敗しました");
  }

  const cases = caseRows || [];
  const invoices = invoiceRows || [];
  const orders = orderRows || [];
  const payments = paymentRows || [];

  const salesAgg = aggregateDashboardV1({
    cases: cases.map((c) => ({
      id: c.id as string,
      status: (c.status as string) || null,
    })),
    invoices: invoices.map((inv) => ({
      id: inv.id as string,
      case_id: (inv.case_id as string) || null,
      status: (inv.status as string) || null,
      invoice_amount: inv.invoice_amount as number | string | null,
      subtotal_ex_tax: inv.subtotal_ex_tax as number | string | null,
      tax_amount: inv.tax_amount as number | string | null,
      invoice_date: (inv.invoice_date as string) || null,
    })),
    orders: orders.map((o) => ({
      case_id: (o.case_id as string) || null,
      status: (o.status as string) || null,
      order_amount: o.order_amount as number | string | null,
    })),
    settlements: settlementRows,
    period,
  });

  const paymentsByInvoice = new Map<string, typeof payments>();
  for (const p of payments) {
    const invId = p.invoice_id as string | null;
    if (!invId) continue;
    const list = paymentsByInvoice.get(invId) || [];
    list.push(p);
    paymentsByInvoice.set(invId, list);
  }

  const settlementTypeByCase = new Map<string, string | null>();
  for (const s of settlementRows) {
    const id = (s.case_id || "").trim();
    if (id) settlementTypeByCase.set(id, s.settlement_type);
  }

  const financeByCase = new Map<string, typeof financeRows>();
  for (const fr of financeRows) {
    const id = (fr.case_id || "").trim();
    if (!id) continue;
    const list = financeByCase.get(id) || [];
    list.push(fr);
    financeByCase.set(id, list);
  }

  const dealerByCase = new Map<string, typeof dealerRows>();
  for (const ds of dealerRows) {
    const id = (ds.case_id || "").trim();
    if (!id) continue;
    const list = dealerByCase.get(id) || [];
    list.push(ds);
    dealerByCase.set(id, list);
  }

  let unpaidAmount = 0;
  let unpaidInvoiceCount = 0;
  let overdueInvoiceCount = 0;

  for (const inv of invoices) {
    if (!isActiveInvoiceStatus(inv.status as string)) continue;
    const caseId = ((inv.case_id as string) || "").trim();
    const summary = summarizeDashboardInvoiceUnpaid({
      invoiceAmount: inv.invoice_amount as number,
      dueDate: (inv.due_date as string) || null,
      payments: paymentsByInvoice.get(inv.id as string) || [],
      settlementType: settlementTypeByCase.get(caseId) || null,
      financeReceipts: financeByCase.get(caseId) || [],
      dealerSettlements: dealerByCase.get(caseId) || [],
    });
    unpaidAmount += summary.unpaidAmount;
    if (summary.isUnpaidLike) unpaidInvoiceCount += 1;
    if (summary.isOverdue) overdueInvoiceCount += 1;
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
