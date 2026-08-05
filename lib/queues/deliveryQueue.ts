/**
 * 納品管理キュー（/queues/deliveries）の純関数。
 * DB I/O なし。表示対象判定・並び・件数ラベル。
 *
 * 納品済み判定は案件詳細 CaseDetailView.getDeliveryStatus と同趣旨:
 * delivered_date あり、または status === "納品済"。
 * （Workflow の areAllOrdersDelivered は請求用に日付必須だが、ここでは変更しない）
 */

import {
  isActiveCaseStatus,
  isActiveOrderStatus,
} from "@/lib/status/activeRecords";

export type DeliveryQueueOrderInput = {
  id: string;
  status?: string | null;
  expected_delivery_date?: string | null;
  delivered_date?: string | null;
};

export type DeliveryQueueCaseInput = {
  id: string;
  case_no: string | null;
  status: string | null;
  customer_name: string | null;
  construction_desired_date: string | null;
  dealer_name: string | null;
  orders: ReadonlyArray<DeliveryQueueOrderInput>;
};

export type DeliveryQueueRow = {
  id: string;
  caseNo: string;
  customerName: string;
  dealerName: string;
  expectedDeliveryDate: string | null;
  constructionDate: string | null;
  orderCount: number;
  deliveredCount: number;
  stateLabel: string;
  detailHref: string;
  confirmHref: string;
};

/** CaseDetailView.getDeliveryStatus の「納品済」条件と同趣旨 */
export function isOrderDelivered(order: {
  status?: string | null;
  delivered_date?: string | null;
  deliveredDate?: string | null;
}): boolean {
  const status = (order.status || "").trim();
  if (status === "納品済") return true;
  const date = (order.delivered_date ?? order.deliveredDate ?? "").trim();
  return Boolean(date);
}

export function activeOrdersForDelivery<T extends { status?: string | null }>(
  orders: ReadonlyArray<T>
): T[] {
  return orders.filter((o) => isActiveOrderStatus(o.status));
}

export function countDeliveredOrders(
  orders: ReadonlyArray<{
    status?: string | null;
    delivered_date?: string | null;
    deliveredDate?: string | null;
  }>
): number {
  return activeOrdersForDelivery(orders).filter((o) => isOrderDelivered(o))
    .length;
}

export function resolveDeliveryStateLabel(
  orderCount: number,
  deliveredCount: number
): string {
  if (orderCount <= 0) return "対象外";
  if (deliveredCount <= 0) return "未納品";
  if (deliveredCount < orderCount) return "一部納品";
  return "全納品済";
}

/** キュー表示対象: 非キャンセル・有効発注≥1・全納品ではない */
export function isDeliveryQueueCandidate(input: {
  caseStatus: string | null | undefined;
  activeOrderCount: number;
  deliveredCount: number;
}): boolean {
  if (!isActiveCaseStatus(input.caseStatus)) return false;
  if (input.activeOrderCount < 1) return false;
  if (input.deliveredCount >= input.activeOrderCount) return false;
  return true;
}

/** 未納品の有効発注のうち、納品予定日が最も早いもの（なければ先頭） */
export function pickConfirmOrder(
  orders: ReadonlyArray<DeliveryQueueOrderInput>
): DeliveryQueueOrderInput | null {
  const undelivered = activeOrdersForDelivery(orders).filter(
    (o) => !isOrderDelivered(o)
  );
  if (undelivered.length === 0) return null;

  const withDate = undelivered
    .filter((o) => (o.expected_delivery_date || "").trim())
    .sort((a, b) =>
      String(a.expected_delivery_date).localeCompare(
        String(b.expected_delivery_date)
      )
    );
  if (withDate.length > 0) return withDate[0];
  return undelivered[0];
}

/** 並び用の案件納品予定日 = 未納品発注の最短 expected_delivery_date */
export function resolveCaseExpectedDeliveryDate(
  orders: ReadonlyArray<DeliveryQueueOrderInput>
): string | null {
  const undelivered = activeOrdersForDelivery(orders).filter(
    (o) => !isOrderDelivered(o)
  );
  const dates = undelivered
    .map((o) => (o.expected_delivery_date || "").trim())
    .filter(Boolean)
    .sort();
  return dates[0] || null;
}

function dateSortKey(value: string | null | undefined): number {
  const v = (value || "").trim();
  if (!v) return Number.POSITIVE_INFINITY;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** 納品予定日昇順 → 工事日昇順 → 案件番号順（未設定は最後） */
export function sortDeliveryQueueRows<
  T extends {
    expectedDeliveryDate: string | null;
    constructionDate: string | null;
    caseNo: string;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const e =
      dateSortKey(a.expectedDeliveryDate) - dateSortKey(b.expectedDeliveryDate);
    if (e !== 0) return e;
    const c =
      dateSortKey(a.constructionDate) - dateSortKey(b.constructionDate);
    if (c !== 0) return c;
    return a.caseNo.localeCompare(b.caseNo, "ja");
  });
}

export function buildDeliveryQueueRow(
  input: DeliveryQueueCaseInput
): DeliveryQueueRow | null {
  const active = activeOrdersForDelivery(input.orders);
  const orderCount = active.length;
  const deliveredCount = countDeliveredOrders(input.orders);

  if (
    !isDeliveryQueueCandidate({
      caseStatus: input.status,
      activeOrderCount: orderCount,
      deliveredCount,
    })
  ) {
    return null;
  }

  const confirm = pickConfirmOrder(input.orders);
  if (!confirm) return null;

  return {
    id: input.id,
    caseNo: input.case_no || "—",
    customerName: input.customer_name || "—",
    dealerName: input.dealer_name || "—",
    expectedDeliveryDate: resolveCaseExpectedDeliveryDate(input.orders),
    constructionDate: input.construction_desired_date,
    orderCount,
    deliveredCount,
    stateLabel: resolveDeliveryStateLabel(orderCount, deliveredCount),
    detailHref: `/cases/${input.id}`,
    confirmHref: `/orders/${confirm.id}/edit`,
  };
}
