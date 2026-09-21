import {
  CASE_REGISTRATION_SETTLEMENT_TYPES,
  type CaseRegistrationSettlementType,
} from "@/lib/caseSettlementTypes";

export const CASE_REGISTRATION_STEPS = [
  { id: 1, label: "案件情報" },
  { id: 2, label: "商品情報" },
  { id: 3, label: "決済区分" },
  { id: 4, label: "確認・登録" },
] as const;

export type CaseRegistrationStepId = (typeof CASE_REGISTRATION_STEPS)[number]["id"];

/** 案件登録UIが扱う正式決済区分（共通型を再利用） */
export const SETTLEMENT_TYPES = CASE_REGISTRATION_SETTLEMENT_TYPES;
export type SettlementType = CaseRegistrationSettlementType;

export type SettlementFormState = {
  settlement_type: SettlementType | "";
  finance_company: string;
  approval_number: string;
  card_brand: string;
};

export type SettlementErrors = {
  form?: string;
  finance_company?: string;
  approval_number?: string;
  card_brand?: string;
};

export type LineType = "PRODUCT" | "PACKAGE";

export type CaseFormState = {
  dealer_id: string;
  customer_name: string;
  customer_phone: string;
  site_address: string;
  contractor_name: string;
  order_received_date: string;
  desired_delivery_date: string;
  construction_desired_date: string;
  assigned_user: string;
  delivery_same_as_site: boolean;
  delivery_name: string;
  delivery_address: string;
  delivery_phone: string;
  receiver_name: string;
};

export type LineDraft = {
  local_id: string;
  line_type: LineType;
  product_id: string;
  package_id: string;
  /**
   * 初期値は products/packages.default_supplier_id。
   * ユーザー変更後は step 移動でも維持する。
   */
  supplier_id: string;
  quantity: string;
  memo: string;
  display_name: string;
  /** 仕入単価（円）。resolver または手入力。空は未設定 */
  purchase_price: string;
  /** 販売単価（円）。dealer×商品 resolver。空は未設定 */
  sales_price: string;
  /** 仕入単価をユーザーが手入力した（仕入先変更で上書きしない） */
  purchase_price_is_manual: boolean;
  /** 選択仕入先にマスタ価格が無い */
  purchase_price_unset: boolean;
  sales_price_unset: boolean;
};

export type CaseFormErrors = Partial<Record<keyof CaseFormState, string>>;

export type LineErrors = {
  line_type?: string;
  product_id?: string;
  package_id?: string;
  supplier_id?: string;
  quantity?: string;
  purchase_price?: string;
};

export function createEmptyLine(): LineDraft {
  return {
    local_id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    line_type: "PRODUCT",
    product_id: "",
    package_id: "",
    supplier_id: "",
    quantity: "1",
    memo: "",
    display_name: "",
    purchase_price: "",
    sales_price: "",
    purchase_price_is_manual: false,
    purchase_price_unset: false,
    sales_price_unset: false,
  };
}

export function createInitialCaseForm(): CaseFormState {
  return {
    dealer_id: "",
    customer_name: "",
    customer_phone: "",
    site_address: "",
    contractor_name: "",
    order_received_date: new Date().toISOString().slice(0, 10),
    desired_delivery_date: "",
    construction_desired_date: "",
    assigned_user: "",
    delivery_same_as_site: true,
    delivery_name: "",
    delivery_address: "",
    delivery_phone: "",
    receiver_name: "",
  };
}

export function createInitialSettlementForm(): SettlementFormState {
  return {
    settlement_type: "",
    finance_company: "",
    approval_number: "",
    card_brand: "",
  };
}

/** 登録ペイロードに影響する入力の指紋（Idempotency-Key 再生成判定用） */
export function registrationFingerprint(
  caseForm: CaseFormState,
  lines: LineDraft[],
  settlement: SettlementFormState
): string {
  return JSON.stringify({
    caseForm,
    settlement: {
      settlement_type: settlement.settlement_type,
      finance_company: settlement.finance_company,
      approval_number: settlement.approval_number,
      card_brand: settlement.card_brand,
    },
    lines: lines.map((l) => ({
      line_type: l.line_type,
      product_id: l.product_id,
      package_id: l.package_id,
      supplier_id: l.supplier_id,
      quantity: l.quantity,
      memo: l.memo,
      display_name: l.display_name,
      purchase_price: l.purchase_price,
      sales_price: l.sales_price,
      purchase_price_is_manual: l.purchase_price_is_manual,
    })),
  });
}
