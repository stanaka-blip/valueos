export const ORDER_STATUS_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "reviewing", label: "確認中" },
  { value: "returned", label: "差し戻し" },
  { value: "accepted", label: "受付済み" },
  { value: "ordered", label: "発注済み" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "取消" },
] as const;

export type OrderStatusFilterValue =
  (typeof ORDER_STATUS_FILTERS)[number]["value"];

/** Normalize stored status (e.g. "'新規受付'" → "新規受付") */
export function normalizeStatus(status: string | null | undefined): string {
  if (!status) {
    return "";
  }

  return status.replace(/^['"]+|['"]+$/g, "").trim();
}

/**
 * Map raw cases.status values (Japanese or English codes) to display labels.
 * Does not mutate stored values.
 */
export function getStatusDisplayLabel(
  status: string | null | undefined
): string {
  const normalized = normalizeStatus(status);

  if (!normalized) {
    return "-";
  }

  const upper = normalized.toUpperCase();

  const codeLabels: Record<string, string> = {
    DRAFT: "下書き",
    REVIEWING: "確認中",
    RETURNED: "差し戻し",
    ACCEPTED: "受付済み",
    ORDERED: "発注済み",
    COMPLETED: "完了",
    CANCELLED: "取消",
    CANCELED: "取消",
  };

  if (codeLabels[upper]) {
    return codeLabels[upper];
  }

  const japaneseAliases: Record<string, string> = {
    下書き: "下書き",
    確認中: "確認中",
    内容確認中: "確認中",
    差し戻し: "差し戻し",
    受付済み: "受付済み",
    新規受付: "受付済み",
    発注済み: "発注済み",
    発注済: "発注済み",
    完了: "完了",
    入金済: "完了",
    完工: "完了",
    取消: "取消",
    キャンセル: "取消",
  };

  return japaneseAliases[normalized] || normalized;
}

export function getStatusBadgeClassName(
  status: string | null | undefined
): string {
  const label = getStatusDisplayLabel(status);

  const styles: Record<string, string> = {
    下書き: "bg-gray-100 text-gray-700",
    確認中: "bg-blue-100 text-blue-700",
    差し戻し: "bg-orange-100 text-orange-800",
    受付済み: "bg-emerald-100 text-emerald-800",
    発注済み: "bg-indigo-100 text-indigo-700",
    完了: "bg-green-200 text-green-800",
    取消: "bg-gray-300 text-gray-600",
  };

  return styles[label] || "bg-gray-100 text-gray-700";
}

export function matchesStatusFilter(
  status: string | null | undefined,
  filter: OrderStatusFilterValue
): boolean {
  if (filter === "all") {
    return true;
  }

  const label = getStatusDisplayLabel(status);
  const filterLabel = ORDER_STATUS_FILTERS.find(
    (item) => item.value === filter
  )?.label;

  return Boolean(filterLabel && label === filterLabel);
}
