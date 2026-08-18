/** Ver1.0 仕入発注ステータス（最小セット） */
export const PURCHASE_ORDER_STATUSES = [
  "未発注",
  "発注済",
  "納品済",
] as const;

export type PurchaseOrderStatus =
  (typeof PURCHASE_ORDER_STATUSES)[number];

export function isPurchaseOrderStatus(
  value: string | null | undefined
): value is PurchaseOrderStatus {
  if (!value) {
    return false;
  }
  return (PURCHASE_ORDER_STATUSES as readonly string[]).includes(
    value
  );
}

/** 発注ステータスから案件ステータスへの反映 */
export function getCaseStatusFromOrderStatus(
  orderStatus: string
): string | null {
  switch (orderStatus) {
    case "未発注":
      return "発注待ち";
    case "発注済":
      return "発注済";
    case "納品済":
      return "納品済";
    default:
      return null;
  }
}

/**
 * 実納品日（orders.delivered_date）。
 * 納品予定日・登録日・updated_at・today・ステータスから推測しない。
 * 空なら NULL（納品済でも自動補完しない）。入力済みならステータスに関係なく保持する。
 */
export function resolveDeliveredDate(
  _status: string,
  currentDeliveredDate: string | null | undefined,
  _today?: string
): string | null {
  const value = (currentDeliveredDate || "").trim();
  return value || null;
}
