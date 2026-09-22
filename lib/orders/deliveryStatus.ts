/**
 * 納品完了判定の単一契約。
 * 納品タブ / 納品キュー / 売掛請求可否で共通利用する。
 *
 * 1件の納品済:
 * - delivered_date がある、または status === "納品済"
 * （Production で実納品日のみ入り status が「発注済」のまま残るケースを吸収）
 *
 * 案件の請求トリガー完納（売掛）:
 * - 有効発注が1件以上あり、すべて上記の納品済
 * - かつすべてに delivered_date がある（PR #139 支払期限 = 実納品月の翌月末）
 */

import { isActiveOrderStatus } from "@/lib/status/activeRecords";

export type DeliveryStatusOrderInput = {
  status?: string | null;
  delivered_date?: string | null;
  deliveredDate?: string | null;
};

export function getOrderDeliveredDate(
  order: DeliveryStatusOrderInput
): string {
  return (order.delivered_date ?? order.deliveredDate ?? "").trim();
}

/** 1発注が納品済か（納品タブ・納品キューと同契約） */
export function isOrderDelivered(order: DeliveryStatusOrderInput): boolean {
  const status = (order.status || "").trim();
  if (status === "納品済") return true;
  return Boolean(getOrderDeliveredDate(order));
}

export function activeOrdersForDeliveryStatus<
  T extends { status?: string | null },
>(orders: ReadonlyArray<T>): T[] {
  return orders.filter((o) => isActiveOrderStatus(o.status));
}

/**
 * 有効発注がすべて納品済か（日付の有無は問わない）。
 * 発注0件は未達。
 */
export function areAllActiveOrdersDelivered(
  orders: ReadonlyArray<DeliveryStatusOrderInput>
): boolean {
  const list = activeOrdersForDeliveryStatus(orders);
  if (list.length === 0) return false;
  return list.every((o) => isOrderDelivered(o));
}

/**
 * 売掛請求トリガー: 全有効発注が納品済かつ実納品日あり。
 * 発注0件は未達。
 */
export function areAllOrdersDeliveredForInvoice(
  orders: ReadonlyArray<DeliveryStatusOrderInput>
): boolean {
  const list = activeOrdersForDeliveryStatus(orders);
  if (list.length === 0) return false;
  return list.every(
    (o) => isOrderDelivered(o) && Boolean(getOrderDeliveredDate(o))
  );
}

/** 納品済扱いなのに delivered_date が無い発注があるか */
export function hasDeliveredMissingDate(
  orders: ReadonlyArray<DeliveryStatusOrderInput>
): boolean {
  return activeOrdersForDeliveryStatus(orders).some(
    (o) => isOrderDelivered(o) && !getOrderDeliveredDate(o)
  );
}
