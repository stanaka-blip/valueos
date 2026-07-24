import { getTypedSupabase } from "@/lib/supabase";
import type {
  OrderItemInsert,
  OrderItemRow,
  OrderItemUpdate,
} from "@/lib/database.types";

export type OrderItemsResult<T> = {
  data: T;
  error: string | null;
};

function toErrorMessage(error: { message: string } | null): string | null {
  return error?.message ?? null;
}

/** 発注IDに紐づく明細一覧 */
export async function listOrderItemsByOrderId(
  orderId: string
): Promise<OrderItemsResult<OrderItemRow[]>> {
  const { data, error } = await getTypedSupabase()
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return {
    data: data ?? [],
    error: toErrorMessage(error),
  };
}

export async function getOrderItemById(
  id: string
): Promise<OrderItemsResult<OrderItemRow | null>> {
  const { data, error } = await getTypedSupabase()
    .from("order_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return {
    data: data ?? null,
    error: toErrorMessage(error),
  };
}

export async function insertOrderItem(
  input: OrderItemInsert
): Promise<OrderItemsResult<OrderItemRow | null>> {
  const { data, error } = await getTypedSupabase()
    .from("order_items")
    .insert(input)
    .select("*")
    .single();

  return {
    data: data ?? null,
    error: toErrorMessage(error),
  };
}

export async function insertOrderItems(
  inputs: OrderItemInsert[]
): Promise<OrderItemsResult<OrderItemRow[]>> {
  if (inputs.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await getTypedSupabase()
    .from("order_items")
    .insert(inputs)
    .select("*");

  return {
    data: data ?? [],
    error: toErrorMessage(error),
  };
}

export async function updateOrderItem(
  id: string,
  patch: OrderItemUpdate
): Promise<OrderItemsResult<OrderItemRow | null>> {
  const { data, error } = await getTypedSupabase()
    .from("order_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  return {
    data: data ?? null,
    error: toErrorMessage(error),
  };
}

export async function deleteOrderItem(
  id: string
): Promise<OrderItemsResult<null>> {
  const { error } = await getTypedSupabase()
    .from("order_items")
    .delete()
    .eq("id", id);

  return {
    data: null,
    error: toErrorMessage(error),
  };
}

export async function deleteOrderItemsByOrderId(
  orderId: string
): Promise<OrderItemsResult<null>> {
  const { error } = await getTypedSupabase()
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  return {
    data: null,
    error: toErrorMessage(error),
  };
}

/**
 * 発注明細を全置換（既存行削除 → 新規挿入）。
 * 画面未接続。後続フェーズ用。
 */
export async function replaceOrderItemsForOrder(
  orderId: string,
  inputs: Omit<OrderItemInsert, "order_id">[]
): Promise<OrderItemsResult<OrderItemRow[]>> {
  const deleted = await deleteOrderItemsByOrderId(orderId);
  if (deleted.error) {
    return { data: [], error: deleted.error };
  }

  return insertOrderItems(
    inputs.map((item) => ({
      ...item,
      order_id: orderId,
    }))
  );
}
