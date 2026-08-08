/**
 * 既存商品への価格一括追加 API の入力検証・RPC payload 構築（純関数）。
 * products は作成・更新しない。
 */

import {
  type ProductSetupPurchasePriceInput,
  type ProductSetupSalesPriceInput,
  type ProductSetupFieldErrors,
  validateCreateProductSetupBody,
} from "./createProductSetupLogic";

export type CreateExistingProductPriceSetupBody = {
  product_id: string;
  purchase_prices: ProductSetupPurchasePriceInput[];
  sales_prices: ProductSetupSalesPriceInput[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * 価格配列検証は新規セットアップと同一ルールを再利用する。
 * product ブロックはダミーで通し、default_supplier 制約を避けるため
 * purchase 先頭の supplier を default に合わせる。
 */
export function validateCreateExistingProductPriceSetupBody(
  body: unknown
):
  | { ok: true; value: CreateExistingProductPriceSetupBody }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: ProductSetupFieldErrors;
    } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
    };
  }

  const input = body as Record<string, unknown>;
  const product_id =
    typeof input.product_id === "string" ? input.product_id.trim() : "";
  if (!isUuid(product_id)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "商品を選択してください",
      field_errors: { product_id: "商品を選択してください" },
    };
  }

  const purchaseRaw = Array.isArray(input.purchase_prices)
    ? input.purchase_prices
    : null;
  if (!purchaseRaw || purchaseRaw.length < 1) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "仕入価格は1件以上必要です",
      field_errors: { purchase_prices: "仕入価格は1件以上必要です" },
    };
  }

  const first = purchaseRaw[0] as Record<string, unknown> | undefined;
  const firstSupplier =
    first && typeof first.supplier_id === "string"
      ? first.supplier_id.trim()
      : "11111111-1111-4111-8111-111111111111";

  const reused = validateCreateProductSetupBody({
    product: {
      manufacturer_id: "11111111-1111-4111-8111-111111111111",
      model_no: "EXISTING",
      name: "EXISTING",
      default_supplier_id: isUuid(firstSupplier)
        ? firstSupplier
        : "11111111-1111-4111-8111-111111111111",
      is_active: true,
    },
    purchase_prices: input.purchase_prices,
    sales_prices: input.sales_prices ?? [],
  });

  if (!reused.ok) {
    const field_errors = { ...(reused.field_errors || {}) };
    for (const key of Object.keys(field_errors)) {
      if (key.startsWith("product.")) delete field_errors[key];
    }
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: reused.error_message,
      field_errors:
        Object.keys(field_errors).length > 0 ? field_errors : reused.field_errors,
    };
  }

  return {
    ok: true,
    value: {
      product_id,
      purchase_prices: reused.value.purchase_prices,
      sales_prices: reused.value.sales_prices,
    },
  };
}

export function buildCreateExistingProductPriceSetupRpcPayload(
  requestId: string,
  body: CreateExistingProductPriceSetupBody
): Record<string, unknown> {
  return {
    request_id: requestId,
    product_id: body.product_id,
    purchase_prices: body.purchase_prices.map((p) => ({
      supplier_id: p.supplier_id,
      purchase_price: p.purchase_price,
      start_date: p.start_date || null,
      end_date: p.end_date || null,
      memo: p.memo || null,
      is_active: p.is_active !== false,
    })),
    sales_prices: body.sales_prices.map((p) => ({
      dealer_id: p.dealer_id,
      sales_price: p.sales_price,
      start_date: p.start_date || null,
      end_date: p.end_date || null,
      memo: p.memo || null,
      is_active: p.is_active !== false,
    })),
  };
}
