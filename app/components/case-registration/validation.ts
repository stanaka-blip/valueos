import type {
  CaseFormErrors,
  CaseFormState,
  LineDraft,
  LineErrors,
  SettlementErrors,
  SettlementFormState,
  SettlementType,
} from "./types";

const MAX_SETTLEMENT_DETAIL_LEN = 500;

export function validateStep1(caseForm: CaseFormState): CaseFormErrors {
  const errors: CaseFormErrors = {};
  if (!caseForm.dealer_id) errors.dealer_id = "販売店は必須です";
  if (!caseForm.customer_name.trim()) errors.customer_name = "顧客名は必須です";
  if (!caseForm.site_address.trim()) errors.site_address = "設置先住所は必須です";
  if (!caseForm.order_received_date) {
    errors.order_received_date = "受注日は必須です";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(caseForm.order_received_date)) {
    errors.order_received_date = "受注日の形式が正しくありません";
  }
  if (!caseForm.delivery_same_as_site && !caseForm.delivery_address.trim()) {
    errors.delivery_address = "納品先住所は必須です";
  }
  return errors;
}

export function validateStep2(
  lines: LineDraft[],
  options?: { enforceDefaultSupplier?: boolean }
): {
  ok: boolean;
  formError: string | null;
  lineErrors: Record<string, LineErrors>;
} {
  const lineErrors: Record<string, LineErrors> = {};
  if (lines.length < 1) {
    return { ok: false, formError: "明細を1件以上追加してください", lineErrors };
  }

  const enforceDefaultSupplier = options?.enforceDefaultSupplier === true;
  let ok = true;
  for (const line of lines) {
    const e: LineErrors = {};
    if (line.line_type === "PRODUCT" && !line.product_id) {
      e.product_id = "商品を選択してください";
    }
    if (line.line_type === "PACKAGE" && !line.package_id) {
      e.package_id = "パッケージを選択してください";
    }
    if (enforceDefaultSupplier && !line.supplier_id) {
      e.supplier_id = "標準仕入先が設定されていません";
    }
    const qtyRaw = String(line.quantity ?? "").trim();
    const qty = /^\d+$/.test(qtyRaw) ? Number(qtyRaw) : NaN;
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
      e.quantity = "数量は1〜9,999の整数で入力してください";
    }
    if (Object.keys(e).length) {
      ok = false;
      lineErrors[line.local_id] = e;
    }
  }

  return {
    ok,
    formError: ok ? null : "必須項目に問題がある明細があります",
    lineErrors,
  };
}

export function hasSettlementErrors(errors: SettlementErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function validateStep3(settlement: SettlementFormState): SettlementErrors {
  const errors: SettlementErrors = {};
  if (!settlement.settlement_type) {
    errors.form = "決済区分は必須です";
    return errors;
  }

  if (settlement.settlement_type === "3社間決済") {
    const finance = settlement.finance_company.trim();
    const approval = settlement.approval_number.trim();
    if (!finance) {
      errors.finance_company = "信販会社は必須です";
    } else if (finance.length > MAX_SETTLEMENT_DETAIL_LEN) {
      errors.finance_company = "信販会社名が長すぎます";
    }
    if (!approval) {
      errors.approval_number = "承認番号は必須です";
    } else if (approval.length > MAX_SETTLEMENT_DETAIL_LEN) {
      errors.approval_number = "承認番号が長すぎます";
    }
  }

  if (settlement.settlement_type === "カード") {
    const brand = settlement.card_brand.trim();
    if (!brand) {
      errors.card_brand = "カード会社名は必須です";
    } else if (brand.length > MAX_SETTLEMENT_DETAIL_LEN) {
      errors.card_brand = "カード会社名が長すぎます";
    }
  }

  return errors;
}

export function resolvedDeliveryAddress(caseForm: CaseFormState): string {
  if (caseForm.delivery_same_as_site) return caseForm.site_address.trim();
  return caseForm.delivery_address.trim();
}

export function buildSettlementPayload(settlement: {
  settlement_type: SettlementType;
  finance_company: string;
  approval_number: string;
  card_brand: string;
}) {
  const type = settlement.settlement_type;
  const isSansha = type === "3社間決済";
  const isCard = type === "カード";
  return {
    settlement_type: type,
    finance_company: isSansha ? settlement.finance_company.trim() : null,
    approval_number: isSansha ? settlement.approval_number.trim() : null,
    card_brand: isCard ? settlement.card_brand.trim() : null,
  };
}

export function buildGatewayBody(
  caseForm: CaseFormState,
  lines: LineDraft[],
  settlement: {
    settlement_type: SettlementType;
    finance_company: string;
    approval_number: string;
    card_brand: string;
  }
) {
  return {
    case: {
      dealer_id: caseForm.dealer_id,
      customer_name: caseForm.customer_name.trim(),
      site_address: caseForm.site_address.trim(),
      order_received_date: caseForm.order_received_date,
      case_no: caseForm.case_no.trim() || null,
      customer_phone: caseForm.customer_phone.trim() || null,
      order_type: caseForm.order_type.trim() || null,
      desired_delivery_date: caseForm.desired_delivery_date || null,
      delivery_address: resolvedDeliveryAddress(caseForm) || null,
      construction_desired_date: caseForm.construction_desired_date || null,
      construction_detail: caseForm.construction_detail.trim() || null,
      assigned_user: caseForm.assigned_user.trim() || null,
      memo: caseForm.memo.trim() || null,
    },
    settlement: buildSettlementPayload(settlement),
    lines: lines.map((line) => ({
      line_type: line.line_type,
      product_id: line.line_type === "PRODUCT" ? line.product_id : null,
      package_id: line.line_type === "PACKAGE" ? line.package_id : null,
      supplier_id: line.supplier_id || null,
      quantity: Number(line.quantity),
      memo: line.memo.trim() || null,
      display_name: line.display_name.trim() || null,
    })),
  };
}

export function safeUserErrorMessage(errorCode?: string, errorMessage?: string): string {
  const allowed = new Set([
    "INVALID_INPUT",
    "PRICE_NOT_FOUND",
    "PACKAGE_ITEMS_NOT_FOUND",
    "PACKAGE_ITEM_PRICE_NOT_FOUND",
    "REQUEST_ID_CONFLICT",
    "REGISTRATION_FAILED",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "RATE_LIMITED",
    "BAD_REQUEST",
    "CONFIG_ERROR",
  ]);
  if (errorMessage && errorMessage.length <= 200 && !/service.?role|SQLSTATE|pg_/i.test(errorMessage)) {
    return errorMessage;
  }
  if (errorCode && allowed.has(errorCode)) {
    if (errorCode === "PRICE_NOT_FOUND") return "価格が見つかりません";
    if (errorCode === "PACKAGE_ITEMS_NOT_FOUND") return "パッケージ構成が見つかりません";
    if (errorCode === "PACKAGE_ITEM_PRICE_NOT_FOUND") {
      return "パッケージ構成の仕入価格が見つかりません";
    }
    if (errorCode === "REQUEST_ID_CONFLICT") return "登録リクエストが競合しました。内容を確認して再度お試しください";
    if (errorCode === "RATE_LIMITED") return "しばらく時間をおいて再度お試しください";
    if (errorCode === "UNAUTHORIZED") return "認証が必要です";
    if (errorCode === "FORBIDDEN") return "不正なリクエストです";
    if (errorCode === "CONFIG_ERROR") return "サーバー設定が完了していません";
  }
  return "登録を完了できませんでした";
}
