import { loadWorkflowAlertCaseIds } from "@/lib/dashboard/caseAlerts";
import {
  dashboardKpiBannerTitle,
  formatDashboardPeriodRange,
} from "@/lib/dashboard/kpiDrilldown";
import { loadDashboard } from "@/lib/dashboard/loadDashboard";
import { isDateInRange } from "@/lib/dashboard/period";
import { loadAllCaseSettlementsAdmin } from "@/lib/queues/loadCaseSettlementsAdmin";
import { resolveOrderQueueSettlementLabel } from "@/lib/queues/orderQueue";
import { isActiveCaseStatus } from "@/lib/status/activeRecords";
import { supabase } from "@/lib/supabase";

import {
  summarizeCaseManufacturers,
  summarizeCaseModelNumbers,
  type CaseListLineInput,
} from "./caseListLineSummary";
import CasesList, { type CasesListItem } from "./CasesList";

export const dynamic = "force-dynamic";

type DealerRelation = {
  name: string | null;
};

type CaseListRow = {
  id: string;
  case_no: string | null;
  created_at: string | null;
  order_received_date: string | null;
  customer_name: string | null;
  order_type: string | null;
  status: string | null;
  department: string | null;
  assigned_user: string | null;
  desired_delivery_date: string | null;
  priority: string | null;
  dealers: DealerRelation | DealerRelation[] | null;
  case_products: CaseListLineInput[] | null;
};

function getSingleRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0] || null;
  return relation;
}

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.round(value)) + "円";
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    orderReceivedFrom?: string;
    orderReceivedTo?: string;
    invoiceFrom?: string;
    invoiceTo?: string;
    fromDashboard?: string;
    alert?: string;
  }>;
}) {
  const params = await searchParams;
  // 互換: from/to も受注日期間として扱う（売上KPIの請求日とは別）
  const orderReceivedFrom =
    params.orderReceivedFrom || params.from || "";
  const orderReceivedTo = params.orderReceivedTo || params.to || "";
  const invoiceFrom = params.invoiceFrom || "";
  const invoiceTo = params.invoiceTo || "";
  const fromDashboard = params.fromDashboard || "";
  const alert = params.alert || "";
  const hasInvoicePeriod = Boolean(invoiceFrom && invoiceTo);

  const [{ data: cases, error }, settlementsResult, dashboard] = await Promise.all([
    supabase
      .from("cases")
      .select(
        `
      id,
      case_no,
      created_at,
      order_received_date,
      customer_name,
      order_type,
      status,
      department,
      assigned_user,
      desired_delivery_date,
      priority,
      dealers (
        name
      ),
      case_products (
        line_type,
        products (
          name,
          model_no,
          manufacturers (
            name
          )
        ),
        packages (
          name,
          manufacturers (
            name
          )
        ),
        case_packages (
          case_package_items (
            product_id,
            model_no_snapshot,
            is_selected,
            is_hidden,
            products (
              model_no
            )
          )
        )
      )
    `
      )
      .order("created_at", { ascending: false }),
    loadAllCaseSettlementsAdmin(),
    hasInvoicePeriod
      ? loadDashboard({
          preset: "custom",
          from: invoiceFrom,
          to: invoiceTo,
        })
      : Promise.resolve(null),
  ]);

  if (error) {
    return (
      <div className="min-h-full bg-[#f7f7f5]">
        <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
          <h1 className="text-xl font-semibold text-gray-900">全案件</h1>
        </header>
        <div className="p-6 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            データ取得エラー：{error.message}
          </div>
        </div>
      </div>
    );
  }

  if (!settlementsResult.ok) {
    return (
      <div className="min-h-full bg-[#f7f7f5]">
        <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
          <h1 className="text-xl font-semibold text-gray-900">全案件</h1>
        </header>
        <div className="p-6 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            データ取得エラー：{settlementsResult.error}
          </div>
        </div>
      </div>
    );
  }

  const settlementByCase = new Map<string, string | null>();
  for (const row of settlementsResult.data) {
    if (!row.case_id) continue;
    settlementByCase.set(String(row.case_id), row.settlement_type);
  }

  let filterIds: Set<string> | null = null;
  let filterLabel = "";
  let filterBanner:
    | {
        title: string;
        period?: string;
        summary?: string;
      }
    | undefined;

  if (alert === "unordered" || alert === "uninvoiced") {
    const alerts = await loadWorkflowAlertCaseIds();
    filterIds = new Set(
      alert === "unordered"
        ? alerts.unorderedCaseIds
        : alerts.uninvoicedCaseIds
    );
    filterLabel = alert === "unordered" ? "未発注アラート" : "未請求アラート";
    if (fromDashboard) {
      filterBanner = {
        title: dashboardKpiBannerTitle(fromDashboard),
        summary: `${filterIds.size}件`,
      };
    }
  } else if (hasInvoicePeriod) {
    if (dashboard?.error) {
      return (
        <div className="min-h-full bg-[#f7f7f5]">
          <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
            <h1 className="text-xl font-semibold text-gray-900">全案件</h1>
          </header>
          <div className="p-6 md:p-8">
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              データ取得エラー：{dashboard.error}
            </div>
          </div>
        </div>
      );
    }
    filterIds = new Set(dashboard?.periodCaseIds || []);
    const periodLabel = formatDashboardPeriodRange(invoiceFrom, invoiceTo);
    filterLabel = `請求日 ${invoiceFrom} 〜 ${invoiceTo}`;
    const source = fromDashboard || "sales";
    const salesYen = formatYen(dashboard?.kpis.sales || 0);
    const profitYen = formatYen(dashboard?.kpis.profit || 0);
    const profitRate = `${(dashboard?.kpis.profitRate || 0).toFixed(1)}%`;
    const amountLabel =
      source === "profit-rate"
        ? `実粗利 ${profitYen} / 粗利率 ${profitRate}`
        : source === "profit"
          ? `実粗利 ${profitYen}`
          : `売上（税抜） ${salesYen}`;
    filterBanner = {
      title: dashboardKpiBannerTitle(source),
      period: periodLabel,
      summary: `${filterIds.size}件 / ${amountLabel}`,
    };
  } else if (orderReceivedFrom && orderReceivedTo) {
    const ids = new Set<string>();
    for (const row of (cases || []) as unknown as CaseListRow[]) {
      if (!isActiveCaseStatus(row.status)) continue;
      if (
        isDateInRange(
          row.order_received_date,
          orderReceivedFrom,
          orderReceivedTo
        )
      ) {
        ids.add(row.id);
      }
    }
    filterIds = ids;
    filterLabel = `受注日 ${orderReceivedFrom} 〜 ${orderReceivedTo}`;
  }

  const items: CasesListItem[] = ((cases || []) as unknown as CaseListRow[])
    .filter((row) => (filterIds ? filterIds.has(row.id) : true))
    .map((row) => {
      const dealer = getSingleRelation(row.dealers);
      const lines = Array.isArray(row.case_products) ? row.case_products : [];
      const settlementType = settlementByCase.has(String(row.id))
        ? settlementByCase.get(String(row.id))
        : null;

      return {
        id: row.id,
        caseNo: row.case_no || "",
        orderType: row.order_type || "",
        orderReceivedDate: row.order_received_date,
        dealerName: dealer?.name || "",
        customerName: row.customer_name || "",
        settlementType: resolveOrderQueueSettlementLabel(settlementType),
        desiredDeliveryDate: row.desired_delivery_date,
        manufacturerSummary: summarizeCaseManufacturers(lines),
        modelNoSummary: summarizeCaseModelNumbers(lines),
        status: row.status,
        department: row.department || "",
        assignedUser: row.assigned_user || "",
        priority: row.priority || "中",
      };
    });

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          全案件
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          すべての案件を表示します（全{items.length}件）
          {filterLabel ? ` / ${filterLabel}` : ""}
        </p>
      </header>

      <div className="p-6 md:p-8">
        <CasesList
          items={items}
          filterLabel={filterLabel}
          filterBanner={filterBanner}
        />
      </div>
    </div>
  );
}
