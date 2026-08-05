import {
  buildOrderQueueRow,
  caseHasOrderableTargets,
  countActiveOrders,
  evaluateOrderQueueGate,
  sortOrderQueueRows,
  type OrderQueueRow,
} from "@/lib/queues/orderQueue";
import { supabase } from "@/lib/supabase";

export type OrderQueueLoadResult = {
  rows: OrderQueueRow[];
  error: string | null;
};

function getSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

type CaseRow = {
  id: string;
  case_no: string | null;
  status: string | null;
  customer_name: string | null;
  order_received_date: string | null;
  construction_desired_date: string | null;
  construction_completed_date?: string | null;
  dealers: { name: string | null } | { name: string | null }[] | null;
  case_products:
    | {
        line_type: string | null;
        product_id: string | null;
      }[]
    | null;
  case_packages: { id: string }[] | null;
};

type SettlementRow = {
  case_id: string;
  settlement_type?: string | null;
  deposit_amount?: number | null;
  loan_status?: string | null;
  card_status?: string | null;
  memo?: string | null;
};

export async function loadOrderQueue(): Promise<OrderQueueLoadResult> {
  const { data: casesData, error: casesError } = await supabase
    .from("cases")
    .select(
      `
      id,
      case_no,
      status,
      customer_name,
      order_received_date,
      construction_desired_date,
      construction_completed_date,
      dealers (
        name
      ),
      case_products (
        line_type,
        product_id
      ),
      case_packages (
        id
      )
    `
    );

  if (casesError) {
    if (/construction_completed_date|schema cache/i.test(casesError.message)) {
      const fallback = await supabase
        .from("cases")
        .select(
          `
          id,
          case_no,
          status,
          customer_name,
          order_received_date,
          construction_desired_date,
          dealers (
            name
          ),
          case_products (
            line_type,
            product_id
          ),
          case_packages (
            id
          )
        `
        );
      if (fallback.error) {
        return { rows: [], error: fallback.error.message };
      }
      return assembleQueue((fallback.data || []) as unknown as CaseRow[]);
    }
    return { rows: [], error: casesError.message };
  }

  return assembleQueue((casesData || []) as unknown as CaseRow[]);
}

async function assembleQueue(cases: CaseRow[]): Promise<OrderQueueLoadResult> {
  const [
    { data: orders, error: ordersError },
    { data: invoices, error: invoicesError },
    { data: payments, error: paymentsError },
    { data: settlements, error: settlementsError },
  ] = await Promise.all([
    supabase.from("orders").select("id, case_id, status, delivered_date"),
    supabase.from("invoices").select("id, case_id, status, invoice_amount"),
    supabase
      .from("payments")
      .select("id, case_id, invoice_id, status, payment_amount"),
    supabase
      .from("case_settlements")
      .select(
        "case_id, settlement_type, deposit_amount, loan_status, card_status, memo"
      ),
  ]);

  const error =
    ordersError?.message ||
    invoicesError?.message ||
    paymentsError?.message ||
    settlementsError?.message ||
    null;
  if (error) {
    return { rows: [], error };
  }

  const ordersByCase = groupBy(orders || [], "case_id");
  const invoicesByCase = groupBy(invoices || [], "case_id");
  const paymentsByCase = groupBy(payments || [], "case_id");
  const settlementByCase = new Map<string, SettlementRow>();
  for (const s of (settlements || []) as SettlementRow[]) {
    if (!s.case_id) continue;
    settlementByCase.set(String(s.case_id), s);
  }

  const rows: OrderQueueRow[] = [];

  for (const c of cases) {
    const caseOrders = ordersByCase.get(c.id) || [];
    const activeOrderCount = countActiveOrders(caseOrders);
    const hasTargets = caseHasOrderableTargets({
      caseProducts: c.case_products || [],
      casePackages: c.case_packages || [],
    });

    const settlement = settlementByCase.get(String(c.id)) || null;
    const gate = evaluateOrderQueueGate({
      settlement,
      constructionCompletedDate: c.construction_completed_date ?? null,
      orders: caseOrders,
      invoices: invoicesByCase.get(c.id) || [],
      payments: paymentsByCase.get(c.id) || [],
    });

    const dealer = getSingle(c.dealers);
    const settlementType =
      settlement?.settlement_type != null
        ? String(settlement.settlement_type)
        : null;
    const row = buildOrderQueueRow(
      {
        id: c.id,
        case_no: c.case_no,
        status: c.status,
        customer_name: c.customer_name,
        order_received_date: c.order_received_date,
        construction_desired_date: c.construction_desired_date,
        dealer_name: dealer?.name || null,
        settlement_type: settlementType,
        has_orderable_targets: hasTargets,
        active_order_count: activeOrderCount,
      },
      gate
    );
    if (row) rows.push(row);
  }

  return { rows: sortOrderQueueRows(rows), error: null };
}

function groupBy<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = row[key] as string | null | undefined;
    if (!id) continue;
    const list = map.get(id) || [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}
