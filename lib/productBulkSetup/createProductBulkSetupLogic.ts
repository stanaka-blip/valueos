/**
 * 商品一括登録の入力検証・RPC payload 構築（純関数）。
 * 価格フィールドは受け取らない。
 */

export type ProductBulkProductInput = {
  model_no: string;
  name: string;
  capacity?: string | null;
  unit?: string | null;
  memo?: string | null;
  is_active?: boolean;
};

export type CreateProductBulkSetupBody = {
  manufacturer_id: string;
  category?: string | null;
  series_id?: string | null;
  products: ProductBulkProductInput[];
};

export type ProductBulkFieldErrors = Record<string, string>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PRODUCTS = 50;
const MAX_SHORT = 200;
const MAX_LONG = 2000;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function validateCreateProductBulkSetupBody(
  body: unknown
):
  | { ok: true; value: CreateProductBulkSetupBody }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: ProductBulkFieldErrors;
    } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
    };
  }

  const input = body as Record<string, unknown>;
  const field_errors: ProductBulkFieldErrors = {};

  const manufacturer_id =
    typeof input.manufacturer_id === "string"
      ? input.manufacturer_id.trim()
      : "";
  if (!isUuid(manufacturer_id)) {
    field_errors.manufacturer_id = "メーカーを選択してください";
  }

  let category: string | null = null;
  if (input.category != null && String(input.category).trim() !== "") {
    category = String(input.category).trim();
    if (category.length > MAX_SHORT) {
      field_errors.category = "カテゴリーが長すぎます";
    }
  }

  let series_id: string | null = null;
  if (input.series_id != null && String(input.series_id).trim() !== "") {
    const s = String(input.series_id).trim();
    if (!isUuid(s)) {
      field_errors.series_id = "シリーズが不正です";
    } else {
      series_id = s;
    }
  }

  if (!Array.isArray(input.products)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "products は配列である必要があります",
      field_errors: { products: "products は配列である必要があります" },
    };
  }
  if (input.products.length < 1) {
    field_errors.products = "商品が1件以上必要です";
  }
  if (input.products.length > MAX_PRODUCTS) {
    field_errors.products = "商品件数が上限を超えています";
  }

  // reject price fields if present on body (defensive)
  if (
    "purchase_prices" in input ||
    "sales_prices" in input ||
    "supplier_id" in input ||
    "dealer_id" in input
  ) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message:
        "この画面では仕入価格・販売価格は登録できません。価格は別画面から設定してください。",
    };
  }

  const products: ProductBulkProductInput[] = [];
  const seenModels = new Set<string>();

  input.products.forEach((row, idx) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      field_errors[`products.${idx}`] = `行${idx + 1}: 行が不正です`;
      return;
    }
    const p = row as Record<string, unknown>;
    if (
      "purchase_price" in p ||
      "sales_price" in p ||
      "supplier_id" in p ||
      "dealer_id" in p
    ) {
      field_errors[`products.${idx}`] =
        `行${idx + 1}: 価格・仕入先・販売店は指定できません`;
    }

    const model_no = typeof p.model_no === "string" ? p.model_no.trim() : "";
    if (!model_no) {
      field_errors[`products.${idx}.model_no`] = `行${idx + 1}: 型番は必須です`;
    } else if (model_no.length > MAX_SHORT) {
      field_errors[`products.${idx}.model_no`] =
        `行${idx + 1}: 型番が長すぎます`;
    } else {
      const key = model_no.toLocaleLowerCase();
      if (seenModels.has(key)) {
        field_errors[`products.${idx}.model_no`] =
          `行${idx + 1}: 同じ型番が複数行に入力されています`;
      } else {
        seenModels.add(key);
      }
    }

    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) {
      field_errors[`products.${idx}.name`] = `行${idx + 1}: 商品名は必須です`;
    } else if (name.length > MAX_SHORT) {
      field_errors[`products.${idx}.name`] =
        `行${idx + 1}: 商品名が長すぎます`;
    }

    let capacity: string | null = null;
    if (p.capacity != null && String(p.capacity).trim() !== "") {
      capacity = String(p.capacity).trim();
      if (capacity.length > MAX_SHORT) {
        field_errors[`products.${idx}.capacity`] =
          `行${idx + 1}: 容量が長すぎます`;
      }
    }

    let unit: string | null = null;
    if (p.unit != null && String(p.unit).trim() !== "") {
      unit = String(p.unit).trim();
      if (unit.length > MAX_SHORT) {
        field_errors[`products.${idx}.unit`] =
          `行${idx + 1}: 単位が長すぎます`;
      }
    }

    let memo: string | null = null;
    if (p.memo != null && String(p.memo).trim() !== "") {
      memo = String(p.memo).trim();
      if (memo.length > MAX_LONG) {
        field_errors[`products.${idx}.memo`] =
          `行${idx + 1}: メモが長すぎます`;
      }
    }

    let is_active = true;
    if (p.is_active != null) {
      if (typeof p.is_active !== "boolean") {
        field_errors[`products.${idx}.is_active`] =
          `行${idx + 1}: 有効フラグが不正です`;
      } else {
        is_active = p.is_active;
      }
    }

    products.push({
      model_no,
      name,
      capacity,
      unit,
      memo,
      is_active,
    });
  });

  if (Object.keys(field_errors).length > 0) {
    const first =
      field_errors.manufacturer_id ||
      field_errors.products ||
      field_errors[`products.0.model_no`] ||
      field_errors[`products.0.name`] ||
      Object.values(field_errors)[0] ||
      "入力内容が正しくありません";
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: first,
      field_errors,
    };
  }

  return {
    ok: true,
    value: {
      manufacturer_id,
      category,
      series_id,
      products,
    },
  };
}

export function buildCreateProductBulkSetupRpcPayload(
  requestId: string,
  body: CreateProductBulkSetupBody
): Record<string, unknown> {
  return {
    request_id: requestId,
    manufacturer_id: body.manufacturer_id,
    category: body.category ?? null,
    series_id: body.series_id ?? null,
    products: body.products.map((p) => ({
      model_no: p.model_no,
      name: p.name,
      capacity: p.capacity ?? null,
      unit: p.unit ?? null,
      memo: p.memo ?? null,
      is_active: p.is_active !== false,
    })),
  };
}

/**
 * 空行除外後の products.N エラーを、画面上の元行 index に戻す。
 * payloadIndexToUiIndex[payloadIdx] = uiRowIndex
 */
export function remapProductBulkFieldErrors(
  fieldErrors: Record<string, string> | undefined,
  payloadIndexToUiIndex: number[]
): Record<string, string> {
  if (!fieldErrors) return {};
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    const m = /^products\.(\d+)(.*)$/.exec(key);
    if (!m) {
      out[key] = message;
      continue;
    }
    const payloadIdx = Number(m[1]);
    const uiIdx = payloadIndexToUiIndex[payloadIdx];
    if (uiIdx == null || !Number.isFinite(uiIdx)) {
      out[key] = message;
      continue;
    }
    out[`products.${uiIdx}${m[2]}`] = message;
  }
  return out;
}

export const PRODUCT_BULK_MAX_PRODUCTS = MAX_PRODUCTS;
