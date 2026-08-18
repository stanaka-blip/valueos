/**
 * ダッシュボード KPI → 既存 /cases / /payments への導線。
 * 集計そのものは loadDashboard / aggregateDashboardV1 と同じ条件。
 */

import { isActiveInvoiceStatus } from "@/lib/status/activeRecords";

export type DashboardKpiSource =
  | "sales"
  | "profit"
  | "profit-rate"
  | "unpaid-amount"
  | "unordered"
  | "uninvoiced"
  | "unpaid"
  | "overdue";

export function isDashboardKpiSource(
  value: string | null | undefined
): value is DashboardKpiSource {
  return (
    value === "sales" ||
    value === "profit" ||
    value === "profit-rate" ||
    value === "unpaid-amount" ||
    value === "unordered" ||
    value === "uninvoiced" ||
    value === "unpaid" ||
    value === "overdue"
  );
}

export function dashboardKpiBannerTitle(source: string | null | undefined): string {
  switch (source) {
    case "sales":
      return "ダッシュボード: 売上（税抜）対象";
    case "profit":
    case "profit-rate":
      return "ダッシュボード: 粗利対象";
    case "unpaid-amount":
      return "ダッシュボード: 未入金額";
    case "unpaid":
      return "ダッシュボード: 未入金";
    case "unordered":
      return "ダッシュボード: 未発注";
    case "uninvoiced":
      return "ダッシュボード: 未請求";
    case "overdue":
      return "ダッシュボード: 期限超過";
    default:
      return "ダッシュボード";
  }
}

export function formatDashboardPeriodRange(from: string, to: string): string {
  return `${from}〜${to}`;
}

export function buildDashboardKpiHref(
  source: DashboardKpiSource,
  period: { from: string; to: string }
): string {
  const invoiceParams = new URLSearchParams();
  invoiceParams.set("invoiceFrom", period.from);
  invoiceParams.set("invoiceTo", period.to);
  invoiceParams.set("fromDashboard", source);

  switch (source) {
    case "sales":
    case "profit":
    case "profit-rate":
      return `/cases?${invoiceParams.toString()}`;
    case "unordered":
      return "/cases?alert=unordered&fromDashboard=unordered";
    case "uninvoiced":
      return "/cases?alert=uninvoiced&fromDashboard=uninvoiced";
    case "unpaid-amount":
      return "/payments?unpaid=1&fromDashboard=unpaid-amount";
    case "unpaid":
      return "/payments?unpaid=1&fromDashboard=unpaid";
    case "overdue":
      return "/payments?overdue=1&fromDashboard=overdue";
  }
}

/** ダッシュボード未入金 KPI と同じ請求行（取消除外・残高 > 0。3社間は回収残） */
export function matchesDashboardUnpaidInvoice(row: {
  invoiceStatus?: string | null;
  unpaidAmount: number;
}): boolean {
  if (!isActiveInvoiceStatus(row.invoiceStatus)) return false;
  return row.unpaidAmount > 0;
}

/** ダッシュボード期限超過 KPI と同じ請求行（3社間は顧客 due で数えない） */
export function matchesDashboardOverdueInvoice(row: {
  invoiceStatus?: string | null;
  isThreeParty?: boolean;
  displayStatus: string;
}): boolean {
  if (!isActiveInvoiceStatus(row.invoiceStatus)) return false;
  if (row.isThreeParty) return false;
  return row.displayStatus === "期限超過";
}
