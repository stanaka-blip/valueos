export const CASE_REGISTRATION_STEPS = [
  { id: 1, label: "案件情報" },
  { id: 2, label: "商品情報" },
  { id: 3, label: "決済区分" },
  { id: 4, label: "確認・登録" },
] as const;

export type CaseRegistrationStepId = (typeof CASE_REGISTRATION_STEPS)[number]["id"];

export const SETTLEMENT_TYPES = ["掛売", "ローン", "現金", "カード", "その他"] as const;
export type SettlementType = (typeof SETTLEMENT_TYPES)[number];

export type LineType = "PRODUCT" | "PACKAGE";

export type CaseFormState = {
  dealer_id: string;
  customer_name: string;
  customer_phone: string;
  site_address: string;
  order_received_date: string;
  desired_delivery_date: string;
  construction_desired_date: string;
  delivery_same_as_site: boolean;
  delivery_address: string;
  order_type: string;
  construction_detail: string;
  assigned_user: string;
  memo: string;
  case_no: string;
};

export type LineDraft = {
  local_id: string;
  line_type: LineType;
  product_id: string;
  package_id: string;
  supplier_id: string;
  quantity: string;
  memo: string;
  display_name: string;
  sales_unit_price: number | null;
  purchase_unit_price: number | null;
  sales_found: boolean;
  purchase_found: boolean;
  price_error: string | null;
  price_loading: boolean;
};

export type CaseFormErrors = Partial<Record<keyof CaseFormState, string>>;

export type LineErrors = {
  line_type?: string;
  product_id?: string;
  package_id?: string;
  supplier_id?: string;
  quantity?: string;
  price?: string;
};

export function createEmptyLine(defaultSupplierId = ""): LineDraft {
  return {
    local_id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    line_type: "PRODUCT",
    product_id: "",
    package_id: "",
    supplier_id: defaultSupplierId,
    quantity: "1",
    memo: "",
    display_name: "",
    sales_unit_price: null,
    purchase_unit_price: null,
    sales_found: false,
    purchase_found: false,
    price_error: null,
    price_loading: false,
  };
}

export function createInitialCaseForm(): CaseFormState {
  return {
    dealer_id: "",
    customer_name: "",
    customer_phone: "",
    site_address: "",
    order_received_date: new Date().toISOString().slice(0, 10),
    desired_delivery_date: "",
    construction_desired_date: "",
    delivery_same_as_site: true,
    delivery_address: "",
    order_type: "",
    construction_detail: "",
    assigned_user: "",
    memo: "",
    case_no: "",
  };
}

/** 登録ペイロードに影響する入力の指紋（Idempotency-Key 再生成判定用） */
export function registrationFingerprint(
  caseForm: CaseFormState,
  lines: LineDraft[],
  settlementType: SettlementType | ""
): string {
  return JSON.stringify({
    caseForm,
    settlementType,
    lines: lines.map((l) => ({
      line_type: l.line_type,
      product_id: l.product_id,
      package_id: l.package_id,
      supplier_id: l.supplier_id,
      quantity: l.quantity,
      memo: l.memo,
      display_name: l.display_name,
    })),
  });
}
