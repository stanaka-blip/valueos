/**
 * 案件詳細の明細追加 — 入力検証（DB非依存）。
 * 登録RPCと同じ: qty 1〜9999整数、価格/仕入先は保存しない。
 */

import { isUuid } from "@/lib/gateway/authCookie";

export const MAX_LINE_QTY = 9999;
export const MAX_PACKAGE_ITEMS = 500;
export const MAX_MEMO_LENGTH = 2000;

export type CaseLineType = "PRODUCT" | "PACKAGE";

export type AddCaseLineBody = {
  line_type?: unknown;
  product_id?: unknown;
  package_id?: unknown;
  quantity?: unknown;
  memo?: unknown;
  is_manual_price?: unknown;
  supplier_id?: unknown;
  sales_price?: unknown;
  purchase_price?: unknown;
  gross_profit?: unknown;
};

export type ValidatedCaseLine = {
  line_type: CaseLineType;
  product_id: string | null;
  package_id: string | null;
  quantity: number;
  memo: string | null;
};

export type AddCaseLineFieldErrors = {
  line_type?: string;
  product_id?: string;
  package_id?: string;
  quantity?: string;
  memo?: string;
};

export type ValidateAddCaseLineResult =
  | { ok: true; line: ValidatedCaseLine }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: AddCaseLineFieldErrors;
    };

function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    if (!/^-?\d+$/.test(value.trim())) return null;
    const n = Number(value.trim());
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  }
  return null;
}

/**
 * クライアントから価格・仕入先が来ても無視する（保存時は常に null）。
 * 手動価格フラグは拒否。
 */
export function validateAddCaseLineBody(
  body: AddCaseLineBody
): ValidateAddCaseLineResult {
  if (body.is_manual_price === true) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "手動価格は利用できません",
    };
  }

  const field_errors: AddCaseLineFieldErrors = {};
  const rawType =
    typeof body.line_type === "string"
      ? body.line_type.trim().toUpperCase()
      : "";
  if (rawType !== "PRODUCT" && rawType !== "PACKAGE") {
    field_errors.line_type = "明細区分が正しくありません";
  }

  const quantity = parseQuantity(body.quantity);
  if (
    quantity == null ||
    quantity < 1 ||
    quantity > MAX_LINE_QTY
  ) {
    field_errors.quantity = "数量が正しくありません";
  }

  let memo: string | null = null;
  if (body.memo != null && body.memo !== "") {
    if (typeof body.memo !== "string") {
      field_errors.memo = "メモが正しくありません";
    } else {
      const trimmed = body.memo.trim();
      if (trimmed.length > MAX_MEMO_LENGTH) {
        field_errors.memo = "入力値が長すぎます";
      } else {
        memo = trimmed || null;
      }
    }
  }

  const productIdRaw =
    typeof body.product_id === "string" ? body.product_id.trim() : "";
  const packageIdRaw =
    typeof body.package_id === "string" ? body.package_id.trim() : "";

  if (rawType === "PRODUCT") {
    if (!productIdRaw || !isUuid(productIdRaw)) {
      field_errors.product_id = "商品が正しくありません";
    }
    if (packageIdRaw) {
      field_errors.package_id = "明細の指定が正しくありません";
    }
  } else if (rawType === "PACKAGE") {
    if (!packageIdRaw || !isUuid(packageIdRaw)) {
      field_errors.package_id = "パッケージが正しくありません";
    }
    if (productIdRaw) {
      field_errors.product_id = "明細の指定が正しくありません";
    }
  }

  if (Object.keys(field_errors).length > 0) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
      field_errors,
    };
  }

  return {
    ok: true,
    line: {
      line_type: rawType as CaseLineType,
      product_id: rawType === "PRODUCT" ? productIdRaw : null,
      package_id: rawType === "PACKAGE" ? packageIdRaw : null,
      quantity: quantity as number,
      memo,
    },
  };
}
