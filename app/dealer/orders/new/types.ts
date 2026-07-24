export const DELIVERY_DESTINATION_TYPES = [
  "設置先住所と同じ",
  "施工店",
  "倉庫",
  "その他",
] as const;

export type DeliveryDestinationType =
  (typeof DELIVERY_DESTINATION_TYPES)[number];

export type DealerOrderCaseForm = {
  dealer_name: string;
  dealer_contact: string;
  customer_name: string;
  customer_name_kana: string;
  customer_phone: string;
  postal_code: string;
  site_address: string;
  desired_delivery_date: string;
  construction_date: string;
  contractor_name: string;
  contractor_contact: string;
  contractor_phone: string;
  delivery_type: DeliveryDestinationType | "";
  delivery_name: string;
  delivery_postal_code: string;
  delivery_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiving_hours: string;
  delivery_notes: string;
  case_memo: string;
};

export const ORDER_CATEGORIES = [
  "パッケージで発注",
  "部材のみ発注",
] as const;

export type OrderCategory = (typeof ORDER_CATEGORIES)[number];

export type PartLine = {
  local_id: string;
  manufacturer_id: string;
  product_id: string;
  quantity: string;
  product_memo: string;
};

export type DealerOrderProductForm = {
  order_category: OrderCategory | "";
  manufacturer_id: string;
  series: string;
  package_product_id: string;
  quantity: string;
  product_memo: string;
  part_lines: PartLine[];
};

export type PartLineErrors = {
  product_id?: string;
  quantity?: string;
};

export type DealerOrderProductFormErrors = {
  order_category?: string;
  manufacturer_id?: string;
  package_product_id?: string;
  quantity?: string;
  part_lines?: Record<string, PartLineErrors>;
};

export const ORDER_FORM_STEPS = [
  { id: 1, label: "案件情報" },
  { id: 2, label: "商品情報" },
  { id: 3, label: "添付資料" },
  { id: 4, label: "確認・送信" },
] as const;

export type OrderFormStepId = (typeof ORDER_FORM_STEPS)[number]["id"];

export type DealerOrderCaseFormErrors = Partial<
  Record<keyof DealerOrderCaseForm, string>
>;

export const REQUIRED_CASE_FORM_FIELDS = [
  "dealer_contact",
  "customer_name",
  "customer_phone",
  "site_address",
  "desired_delivery_date",
  "construction_date",
  "delivery_type",
  "delivery_address",
  "receiver_name",
  "receiver_phone",
] as const satisfies ReadonlyArray<keyof DealerOrderCaseForm>;

export type RequiredCaseFormField =
  (typeof REQUIRED_CASE_FORM_FIELDS)[number];

export function createEmptyPartLine(): PartLine {
  return {
    local_id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    manufacturer_id: "",
    product_id: "",
    quantity: "1",
    product_memo: "",
  };
}

export const INITIAL_PART_LINE: PartLine = {
  local_id: "part-initial",
  manufacturer_id: "",
  product_id: "",
  quantity: "1",
  product_memo: "",
};
