/**
 * 販売店起点販売価格一括登録の入力検証・RPC payload 構築（純関数）。
 */

export type DealerSalesPriceItemInput = {
  product_id: string;
  sales_price: number;
  start_date?: string | null;
  end_date?: string | null;
  memo?: string | null;
  is_active?: boolean;
};

export type CreateDealerSalesPricesBody = {
  dealer_id: string;
  items: DealerSalesPriceItemInput[];
};

export type DealerSalesPriceFieldErrors = Record<string, string>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 200;
const MAX_LONG = 2000;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function validateCreateDealerSalesPricesBody(
  body: unknown
):
  | { ok: true; value: CreateDealerSalesPricesBody }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: DealerSalesPriceFieldErrors;
    } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
    };
  }

  const input = body as Record<string, unknown>;
  const field_errors: DealerSalesPriceFieldErrors = {};

  const dealer_id =
    typeof input.dealer_id === "string" ? input.dealer_id.trim() : "";
  if (!isUuid(dealer_id)) {
    field_errors.dealer_id = "販売店を選択してください";
  }

  if (!Array.isArray(input.items)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "items は配列である必要があります",
      field_errors: { items: "items は配列である必要があります" },
    };
  }
  if (input.items.length < 1) {
    field_errors.items = "登録対象が1件以上必要です";
  }
  if (input.items.length > MAX_ITEMS) {
    field_errors.items = "登録件数が上限を超えています";
  }

  const items: DealerSalesPriceItemInput[] = [];
  const seenProducts = new Set<string>();

  input.items.forEach((row, idx) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      field_errors[`items.${idx}`] = "行が不正です";
      return;
    }
    const r = row as Record<string, unknown>;
    const product_id =
      typeof r.product_id === "string" ? r.product_id.trim() : "";
    if (!isUuid(product_id)) {
      field_errors[`items.${idx}.product_id`] = "商品が不正です";
    } else if (seenProducts.has(product_id)) {
      field_errors[`items.${idx}.product_id`] =
        "同じ商品が複数行に入力されています";
    } else {
      seenProducts.add(product_id);
    }

    const n =
      typeof r.sales_price === "number"
        ? r.sales_price
        : typeof r.sales_price === "string" && r.sales_price.trim() !== ""
          ? Number(r.sales_price)
          : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      field_errors[`items.${idx}.sales_price`] =
        "販売価格は1円以上で入力してください";
    }

    let start_date: string | null = null;
    if (r.start_date != null && String(r.start_date).trim() !== "") {
      const v = String(r.start_date).trim();
      if (!DATE_RE.test(v)) {
        field_errors[`items.${idx}.start_date`] = "適用開始日が不正です";
      } else {
        start_date = v;
      }
    }

    let end_date: string | null = null;
    if (r.end_date != null && String(r.end_date).trim() !== "") {
      const v = String(r.end_date).trim();
      if (!DATE_RE.test(v)) {
        field_errors[`items.${idx}.end_date`] = "適用終了日が不正です";
      } else {
        end_date = v;
      }
    }
    if (start_date && end_date && end_date < start_date) {
      field_errors[`items.${idx}.end_date`] =
        "適用終了日は適用開始日以降に設定してください";
    }

    let memo: string | null = null;
    if (r.memo != null && String(r.memo).trim() !== "") {
      memo = String(r.memo).trim();
      if (memo.length > MAX_LONG) {
        field_errors[`items.${idx}.memo`] = "メモが長すぎます";
      }
    }

    let is_active = true;
    if (r.is_active != null) {
      if (typeof r.is_active !== "boolean") {
        field_errors[`items.${idx}.is_active`] = "有効フラグが不正です";
      } else {
        is_active = r.is_active;
      }
    }

    if (
      isUuid(product_id) &&
      Number.isFinite(n) &&
      n > 0 &&
      !field_errors[`items.${idx}.end_date`] &&
      !field_errors[`items.${idx}.start_date`]
    ) {
      items.push({
        product_id,
        sales_price: n,
        start_date,
        end_date,
        memo,
        is_active,
      });
    }
  });

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
    value: { dealer_id, items },
  };
}

export function buildCreateDealerSalesPricesRpcPayload(
  requestId: string,
  body: CreateDealerSalesPricesBody
): Record<string, unknown> {
  return {
    request_id: requestId,
    dealer_id: body.dealer_id,
    items: body.items.map((item) => ({
      product_id: item.product_id,
      sales_price: item.sales_price,
      start_date: item.start_date || null,
      end_date: item.end_date || null,
      memo: item.memo || null,
      is_active: item.is_active !== false,
    })),
  };
}
