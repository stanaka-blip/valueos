import {
  buildCollectionQueueRow,
  sortCollectionQueueRows,
  type CollectionQueueRow,
} from "@/lib/queues/collectionQueue";
import { supabase } from "@/lib/supabase";

export type CollectionQueueLoadResult = {
  rows: CollectionQueueRow[];
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
  construction_completed_date?: string | null;
  dealers: { name: string | null } | { name: string | null }[] | null;
};

type SettlementRow = {
  case_id: string;
  settlement_type?: string | null;
  deposit_amount?: number | null;
  loan_status?: string | null;
  card_status?: string | null;
  approval_number?: string | null;
  memo?: string | null;
};

type OrderRow = {
  id: string;
  case_id: string | null;
  status: string | null;
  delivered_date: string | null;
};

type InvoiceRow = {
  id: string;
  case_id: string | null;
  status: string | null;
  invoice_amount: number | null;
  due_date: string | null;
};

type PaymentRow = {
  id: string;
  case_id: string | null;
  invoice_id: string | null;
  status: string | null;
  payment_amount: number | null;
};

export async function loadCollectionQueue(): Promise<CollectionQueueLoadResult> {
  const [
    { data: casesData, error: casesError },
    { data: settlements, error: settlementsError },
    { data: orders, error: ordersError },
    { data: invoices, error: invoicesError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    supabase.from("cases").select(
      `
      id,
      case_no,
      status,
      customer_name,
      order_received_date,
      construction_completed_date,
      dealers (
        name
      )
    `
    ),
    supabase
      .from("case_settlements")
      .select(
        "case_id, settlement_type, deposit_amount, loan_status, card_status, approval_number, memo"
      ),
    supabase.from("orders").select("id, case_id, status, delivered_date"),
    supabase
      .from("invoices")
      .select("id, case_id, status, invoice_amount, due_date"),
    supabase
      .from("payments")
      .select("id, case_id, invoice_id, status, payment_amount"),
  ]);

  // construction_completed_date 未適用環境向けフォールバック
  if (casesError && /construction_completed_date|schema cache/i.test(casesError.message)) {
    const fallback = await supabase.from("cases").select(
      `
      id,
      case_no,
      status,
      customer_name,
      order_received_date,
      dealers (
        name
      )
    `
    );
    if (fallback.error) {
      return { rows: [], error: fallback.error.message };
    }
    return assemble(
      (fallback.data || []) as unknown as CaseRow[],
      (settlements || []) as SettlementRow[],
      (orders || []) as OrderRow[],
      (invoices || []) as InvoiceRow[],
      (payments || []) as PaymentRow[],
      settlementsError?.message ||
        ordersError?.message ||
        invoicesError?.message ||
        paymentsError?.message ||
        null
    );
  }

  const error =
    casesError?.message ||
    settlementsError?.message ||
    ordersError?.message ||
    invoicesError?.message ||
    paymentsError?.message ||
    null;
  if (error) {
    return { rows: [], error };
  }

  return assemble(
    (casesData || []) as unknown as CaseRow[],
    (settlements || []) as SettlementRow[],
    (orders || []) as OrderRow[],
    (invoices || []) as InvoiceRow[],
    (payments || []) as PaymentRow[],
    null
  );
}

function assemble(
  cases: CaseRow[],
  settlements: SettlementRow[],
  orders: OrderRow[],
  invoices: InvoiceRow[],
  payments: PaymentRow[],
  error: string | null
): CollectionQueueLoadResult {
  if (error) {
    return { rows: [], error };
  }

  const settlementByCase = new Map<string, SettlementRow>();
  for (const s of settlements) {
    settlementByCase.set(s.case_id, s);
  }

  const ordersByCase = groupBy(orders, "case_id");
  const invoicesByCase = groupBy(invoices, "case_id");
  const paymentsByCase = groupBy(payments, "case_id");

  const rows: CollectionQueueRow[] = [];
  for (const c of cases) {
    const settlement = settlementByCase.get(c.id) || null;
    const dealer = getSingle(c.dealers);
    const row = buildCollectionQueueRow({
      id: c.id,
      case_no: c.case_no,
      status: c.status,
      customer_name: c.customer_name,
      order_received_date: c.order_received_date,
      dealer_name: dealer?.name || null,
      settlement_type: settlement?.settlement_type ?? null,
      deposit_amount: settlement?.deposit_amount ?? null,
      loan_status: settlement?.loan_status ?? null,
      card_status: settlement?.card_status ?? null,
      approval_number: settlement?.approval_number ?? null,
      orders: ordersByCase.get(c.id) || [],
      invoices: invoicesByCase.get(c.id) || [],
      payments: paymentsByCase.get(c.id) || [],
    });
    if (row) rows.push(row);
  }

  return { rows: sortCollectionQueueRows(rows), error: null };
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
