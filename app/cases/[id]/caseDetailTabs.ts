export type CaseDetailTabId =
  | "basic"
  | "products"
  | "settlement"
  | "purchase"
  | "delivery"
  | "invoice"
  | "payment"
  | "profit"
  | "documents";

export const CASE_DETAIL_TABS: { id: CaseDetailTabId; label: string }[] = [
  { id: "basic", label: "基本情報" },
  { id: "products", label: "商品" },
  { id: "settlement", label: "決済" },
  { id: "purchase", label: "仕入" },
  { id: "delivery", label: "納品" },
  { id: "invoice", label: "請求・入金" },
  { id: "payment", label: "支払" },
  { id: "profit", label: "粗利" },
  { id: "documents", label: "資料" },
];

const CASE_DETAIL_TAB_IDS = new Set<string>(
  CASE_DETAIL_TABS.map((t) => t.id)
);

export function resolveCaseDetailTabId(
  value: string | null | undefined
): CaseDetailTabId {
  if (value === "receipt") {
    return "invoice";
  }
  if (value && CASE_DETAIL_TAB_IDS.has(value)) {
    return value as CaseDetailTabId;
  }
  return "basic";
}
