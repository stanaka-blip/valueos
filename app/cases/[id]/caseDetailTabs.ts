export type CaseDetailTabId =
  | "basic"
  | "products"
  | "settlement"
  | "purchase"
  | "delivery"
  | "invoice"
  | "receipt"
  | "payment"
  | "profit";

export const CASE_DETAIL_TABS: { id: CaseDetailTabId; label: string }[] = [
  { id: "basic", label: "基本情報" },
  { id: "products", label: "商品" },
  { id: "settlement", label: "決済" },
  { id: "purchase", label: "仕入" },
  { id: "delivery", label: "納品" },
  { id: "invoice", label: "請求" },
  { id: "receipt", label: "入金" },
  { id: "payment", label: "支払" },
  { id: "profit", label: "粗利" },
];

const CASE_DETAIL_TAB_IDS = new Set<string>(
  CASE_DETAIL_TABS.map((t) => t.id)
);

export function resolveCaseDetailTabId(
  value: string | null | undefined
): CaseDetailTabId {
  if (value && CASE_DETAIL_TAB_IDS.has(value)) {
    return value as CaseDetailTabId;
  }
  return "basic";
}
