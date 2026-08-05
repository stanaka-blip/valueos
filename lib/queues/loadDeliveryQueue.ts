import {
  buildDeliveryQueueRow,
  sortDeliveryQueueRows,
  type DeliveryQueueRow,
} from "@/lib/queues/deliveryQueue";
import { supabase } from "@/lib/supabase";

export type DeliveryQueueLoadResult = {
  rows: DeliveryQueueRow[];
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
  construction_desired_date: string | null;
  dealers: { name: string | null } | { name: string | null }[] | null;
};

type OrderRow = {
  id: string;
  case_id: string | null;
  status: string | null;
  expected_delivery_date: string | null;
  delivered_date: string | null;
};

export async function loadDeliveryQueue(): Promise<DeliveryQueueLoadResult> {
  const [
    { data: casesData, error: casesError },
    { data: ordersData, error: ordersError },
  ] = await Promise.all([
    supabase.from("cases").select(
      `
      id,
      case_no,
      status,
      customer_name,
      construction_desired_date,
      dealers (
        name
      )
    `
    ),
    supabase
      .from("orders")
      .select(
        "id, case_id, status, expected_delivery_date, delivered_date"
      ),
  ]);

  const error = casesError?.message || ordersError?.message || null;
  if (error) {
    return { rows: [], error };
  }

  const ordersByCase = new Map<string, OrderRow[]>();
  for (const order of (ordersData || []) as OrderRow[]) {
    if (!order.case_id) continue;
    const list = ordersByCase.get(order.case_id) || [];
    list.push(order);
    ordersByCase.set(order.case_id, list);
  }

  const rows: DeliveryQueueRow[] = [];
  for (const c of (casesData || []) as unknown as CaseRow[]) {
    const dealer = getSingle(c.dealers);
    const row = buildDeliveryQueueRow({
      id: c.id,
      case_no: c.case_no,
      status: c.status,
      customer_name: c.customer_name,
      construction_desired_date: c.construction_desired_date,
      dealer_name: dealer?.name || null,
      orders: ordersByCase.get(c.id) || [],
    });
    if (row) rows.push(row);
  }

  return { rows: sortDeliveryQueueRows(rows), error: null };
}
