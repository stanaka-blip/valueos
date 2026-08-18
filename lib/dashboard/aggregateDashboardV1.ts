/**
 * ダッシュボード KPI / 推移（v1）。
 * 売上・粗利は PR #134 の caseProfitCalc を案件単位で再利用し、
 * 請求日で期間に載せる。CF 台帳は引数に取らない。
 */

import {
  computeConfirmedCaseProfit,
  resolveInvoiceProfitTax,
  type CaseProfitFeeInput,
} from "@/lib/profit/caseProfitCalc";
import {
  enumerateBuckets,
  isDateInRange,
  periodBucketKey,
  type DashboardPeriod,
} from "@/lib/dashboard/period";
import { isActiveCaseStatus } from "@/lib/status/activeRecords";

export type DashboardInvoiceInput = {
  id?: string;
  case_id?: string | null;
  status?: string | null;
  invoice_amount?: number | string | null;
  subtotal_ex_tax?: number | string | null;
  tax_amount?: number | string | null;
  invoice_date?: string | null;
};

export type DashboardOrderInput = {
  case_id?: string | null;
  status?: string | null;
  order_amount?: number | string | null;
};

export type DashboardSettlementFeeInput = {
  case_id?: string | null;
  fee_amount?: number | string | null;
  fee_rate?: number | string | null;
};

export type DashboardCaseInput = {
  id: string;
  status?: string | null;
};

export type DashboardV1Aggregate = {
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

function groupByCaseId<T extends { case_id?: string | null }>(
  rows: readonly T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = (row.case_id || "").trim();
    if (!id) continue;
    const list = map.get(id) || [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function feeInputOf(
  row: DashboardSettlementFeeInput | undefined
): CaseProfitFeeInput | null {
  if (!row) return null;
  return {
    feeAmount: row.fee_amount == null ? null : Number(row.fee_amount),
    feeRate: row.fee_rate == null ? null : Number(row.fee_rate),
  };
}

function shareAmount(total: number, part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  return Math.floor((total * part) / whole);
}

/**
 * 期間内の有効請求を税抜売上とし、同じ請求の案件に紐づく発注・手数料を
 * 税抜売上比で按分して確定粗利にする（案件全体が期間内なら caseProfitCalc と一致）。
 */
export function aggregateDashboardV1(input: {
  cases: readonly DashboardCaseInput[];
  invoices: readonly DashboardInvoiceInput[];
  orders: readonly DashboardOrderInput[];
  settlements: readonly DashboardSettlementFeeInput[];
  period: Pick<DashboardPeriod, "from" | "to" | "grain">;
}): DashboardV1Aggregate {
  const activeCaseIds = new Set(
    input.cases.filter((c) => isActiveCaseStatus(c.status)).map((c) => c.id)
  );

  const invoicesByCase = groupByCaseId(
    input.invoices.filter((inv) => activeCaseIds.has((inv.case_id || "").trim()))
  );
  const ordersByCase = groupByCaseId(
    input.orders.filter((o) => activeCaseIds.has((o.case_id || "").trim()))
  );
  const settlementByCase = new Map<string, DashboardSettlementFeeInput>();
  for (const s of input.settlements) {
    const id = (s.case_id || "").trim();
    if (id) settlementByCase.set(id, s);
  }

  const buckets = enumerateBuckets(
    input.period.from,
    input.period.to,
    input.period.grain
  );
  const salesMap = new Map<string, number>(buckets.map((k) => [k, 0]));
  const profitMap = new Map<string, number>(buckets.map((k) => [k, 0]));
  const periodCaseIds = new Set<string>();

  let sales = 0;
  let profit = 0;

  for (const caseId of invoicesByCase.keys()) {
    const caseInvoices = invoicesByCase.get(caseId) || [];
    const confirmed = computeConfirmedCaseProfit({
      invoices: caseInvoices.map((inv) => ({
        status: inv.status,
        invoiceAmount: inv.invoice_amount,
        subtotalExTax: inv.subtotal_ex_tax,
        taxAmount: inv.tax_amount,
      })),
      orders: (ordersByCase.get(caseId) || []).map((o) => ({
        status: o.status,
        orderAmount: o.order_amount,
      })),
      fee: feeInputOf(settlementByCase.get(caseId)),
    });

    if (confirmed.revenue <= 0) continue;

    const inPeriod: Array<{ amount: number; date: string | null }> = [];
    for (const inv of caseInvoices) {
      if (String(inv.status || "").trim() === "取消") continue;
      const taxParts = resolveInvoiceProfitTax({
        invoiceAmount: inv.invoice_amount,
        subtotalExTax: inv.subtotal_ex_tax,
        taxAmount: inv.tax_amount,
      });
      if (taxParts.billedInclusive <= 0) continue;
      if (!isDateInRange(inv.invoice_date, input.period.from, input.period.to)) {
        continue;
      }
      inPeriod.push({ amount: taxParts.subtotalExTax, date: inv.invoice_date || null });
    }
    if (inPeriod.length === 0) continue;

    const periodRevenue = inPeriod.reduce((sum, row) => sum + row.amount, 0);
    const periodCost = shareAmount(
      confirmed.cost,
      periodRevenue,
      confirmed.revenue
    );
    const periodFee = shareAmount(
      confirmed.fee,
      periodRevenue,
      confirmed.revenue
    );

    sales += periodRevenue;
    profit += periodRevenue - periodCost - periodFee;
    periodCaseIds.add(caseId);

    let allocatedCost = 0;
    let allocatedFee = 0;
    inPeriod.forEach((row, index) => {
      const isLast = index === inPeriod.length - 1;
      const costShare = isLast
        ? periodCost - allocatedCost
        : shareAmount(confirmed.cost, row.amount, confirmed.revenue);
      const feeShare = isLast
        ? periodFee - allocatedFee
        : shareAmount(confirmed.fee, row.amount, confirmed.revenue);
      allocatedCost += costShare;
      allocatedFee += feeShare;
      const lineProfit = row.amount - costShare - feeShare;
      const key = periodBucketKey(row.date, input.period.grain);
      if (!key || !salesMap.has(key)) return;
      salesMap.set(key, (salesMap.get(key) || 0) + row.amount);
      profitMap.set(key, (profitMap.get(key) || 0) + lineProfit);
    });
  }

  const profitRate = sales > 0 ? (profit / sales) * 100 : 0;

  const trend = buckets.map((key) => ({
    key,
    label:
      input.period.grain === "month" ? key.replace("-", "/") : key.slice(5),
    sales: salesMap.get(key) || 0,
    profit: profitMap.get(key) || 0,
  }));

  return {
    sales,
    profit,
    profitRate,
    periodCaseIds: Array.from(periodCaseIds),
    trend,
  };
}
