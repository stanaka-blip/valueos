/**
 * 商品セットアップ API の入力検証・RPC payload 構築（純関数）。
 */

export type ProductSetupProductInput = {
  manufacturer_id: string;
  series_id?: string | null;
  category?: string | null;
  model_no: string;
  name: string;
  capacity?: string | null;
  unit?: string | null;
  memo?: string | null;
  is_active?: boolean;
  default_supplier_id: string;
};

export type ProductSetupPurchasePriceInput = {
  supplier_id: string;
  purchase_price: number;
  start_date?: string | null;
  end_date?: string | null;
  memo?: string | null;
  is_active?: boolean;
};

export type ProductSetupSalesPriceInput = {
  dealer_id: string;
  sales_price: number;
  start_date?: string | null;
  end_date?: string | null;
  memo?: string | null;
  is_active?: boolean;
};

export type CreateProductSetupBody = {
  product: ProductSetupProductInput;
  purchase_prices: ProductSetupPurchasePriceInput[];
  sales_prices: ProductSetupSalesPriceInput[];
};

export type ProductSetupFieldErrors = Record<string, string>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_PURCHASE = 50;
const MAX_SALES = 100;
const MAX_SHORT = 200;
const MAX_LONG = 2000;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function optionalTrimmed(
  value: unknown,
  max: number,
  field: string,
  field_errors: ProductSetupFieldErrors
): string | null {
  if (value == null || String(value).trim() === "") return null;
  const v = String(value).trim();
  if (v.length > max) {
    field_errors[field] = "文字数が上限を超えています";
    return null;
  }
  return v;
}

function parseOptionalDate(
  value: unknown,
  field: string,
  field_errors: ProductSetupFieldErrors
): string | null {
  if (value == null || String(value).trim() === "") return null;
  const v = String(value).trim();
  if (!DATE_RE.test(v)) {
    field_errors[field] = "日付が不正です";
    return null;
  }
  return v;
}

function parsePositiveNumber(
  value: unknown,
  field: string,
  field_errors: ProductSetupFieldErrors,
  label: string
): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    field_errors[field] = `${label}は1円以上で入力してください`;
    return null;
  }
  return n;
}

export function validateCreateProductSetupBody(
  body: unknown
):
  | { ok: true; value: CreateProductSetupBody }
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
  const field_errors: ProductSetupFieldErrors = {};

  const productRaw = input.product;
  if (!productRaw || typeof productRaw !== "object" || Array.isArray(productRaw)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "商品情報が必要です",
      field_errors: { product: "商品情報が必要です" },
    };
  }
  const productIn = productRaw as Record<string, unknown>;

  const manufacturer_id =
    typeof productIn.manufacturer_id === "string"
      ? productIn.manufacturer_id.trim()
      : "";
  if (!isUuid(manufacturer_id)) {
    field_errors["product.manufacturer_id"] = "メーカーを選択してください";
  }

  let series_id: string | null = null;
  if (
    productIn.series_id != null &&
    String(productIn.series_id).trim() !== ""
  ) {
    const s = String(productIn.series_id).trim();
    if (!isUuid(s)) {
      field_errors["product.series_id"] = "シリーズが不正です";
    } else {
      series_id = s;
    }
  }

  const default_supplier_id =
    typeof productIn.default_supplier_id === "string"
      ? productIn.default_supplier_id.trim()
      : "";
  if (!isUuid(default_supplier_id)) {
    field_errors["product.default_supplier_id"] =
      "標準仕入先を選択してください";
  }

  const name =
    typeof productIn.name === "string" ? productIn.name.trim() : "";
  if (!name) {
    field_errors["product.name"] = "商品名を入力してください";
  } else if (name.length > MAX_SHORT) {
    field_errors["product.name"] = "商品名が長すぎます";
  }

  const model_no =
    typeof productIn.model_no === "string" ? productIn.model_no.trim() : "";
  if (!model_no) {
    field_errors["product.model_no"] = "型番を入力してください";
  } else if (model_no.length > MAX_SHORT) {
    field_errors["product.model_no"] = "型番が長すぎます";
  }

  const category = optionalTrimmed(
    productIn.category,
    MAX_SHORT,
    "product.category",
    field_errors
  );
  const capacity = optionalTrimmed(
    productIn.capacity,
    MAX_SHORT,
    "product.capacity",
    field_errors
  );
  const unit = optionalTrimmed(
    productIn.unit,
    MAX_SHORT,
    "product.unit",
    field_errors
  );
  const memo = optionalTrimmed(
    productIn.memo,
    MAX_LONG,
    "product.memo",
    field_errors
  );

  let is_active = true;
  if (productIn.is_active != null) {
    if (typeof productIn.is_active !== "boolean") {
      field_errors["product.is_active"] = "有効フラグが不正です";
    } else {
      is_active = productIn.is_active;
    }
  }

  if (!Array.isArray(input.purchase_prices)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "仕入価格は配列である必要があります",
      field_errors: { purchase_prices: "仕入価格は配列である必要があります" },
    };
  }
  if (input.purchase_prices.length < 1) {
    field_errors.purchase_prices = "仕入価格は1件以上必要です";
  }
  if (input.purchase_prices.length > MAX_PURCHASE) {
    field_errors.purchase_prices = "仕入価格の件数が上限を超えています";
  }

  const purchase_prices: ProductSetupPurchasePriceInput[] = [];
  const seenSuppliers = new Set<string>();
  input.purchase_prices.forEach((row, idx) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      field_errors[`purchase_prices.${idx}`] = "仕入価格の行が不正です";
      return;
    }
    const r = row as Record<string, unknown>;
    const supplier_id =
      typeof r.supplier_id === "string" ? r.supplier_id.trim() : "";
    if (!isUuid(supplier_id)) {
      field_errors[`purchase_prices.${idx}.supplier_id`] =
        "仕入先を選択してください";
    } else if (seenSuppliers.has(supplier_id)) {
      field_errors[`purchase_prices.${idx}.supplier_id`] =
        "同じ仕入先が複数行に入力されています";
    } else {
      seenSuppliers.add(supplier_id);
    }

    const purchase_price = parsePositiveNumber(
      r.purchase_price,
      `purchase_prices.${idx}.purchase_price`,
      field_errors,
      "仕入価格"
    );
    const start_date = parseOptionalDate(
      r.start_date,
      `purchase_prices.${idx}.start_date`,
      field_errors
    );
    const end_date = parseOptionalDate(
      r.end_date,
      `purchase_prices.${idx}.end_date`,
      field_errors
    );
    if (start_date && end_date && end_date < start_date) {
      field_errors[`purchase_prices.${idx}.end_date`] =
        "適用終了日は適用開始日以降に設定してください";
    }
    const priceMemo = optionalTrimmed(
      r.memo,
      MAX_LONG,
      `purchase_prices.${idx}.memo`,
      field_errors
    );
    let priceActive = true;
    if (r.is_active != null) {
      if (typeof r.is_active !== "boolean") {
        field_errors[`purchase_prices.${idx}.is_active`] =
          "有効フラグが不正です";
      } else {
        priceActive = r.is_active;
      }
    }

    if (
      isUuid(supplier_id) &&
      purchase_price != null &&
      !field_errors[`purchase_prices.${idx}.end_date`]
    ) {
      purchase_prices.push({
        supplier_id,
        purchase_price,
        start_date,
        end_date,
        memo: priceMemo,
        is_active: priceActive,
      });
    }
  });

  if (
    isUuid(default_supplier_id) &&
    purchase_prices.length > 0 &&
    !seenSuppliers.has(default_supplier_id)
  ) {
    field_errors["product.default_supplier_id"] =
      "標準仕入先は仕入価格に含まれる仕入先から選んでください";
  }

  let salesRaw = input.sales_prices;
  if (salesRaw == null) salesRaw = [];
  if (!Array.isArray(salesRaw)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "販売価格は配列である必要があります",
      field_errors: { sales_prices: "販売価格は配列である必要があります" },
    };
  }
  if (salesRaw.length > MAX_SALES) {
    field_errors.sales_prices = "販売価格の件数が上限を超えています";
  }

  const sales_prices: ProductSetupSalesPriceInput[] = [];
  const seenDealers = new Set<string>();
  salesRaw.forEach((row, idx) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      field_errors[`sales_prices.${idx}`] = "販売価格の行が不正です";
      return;
    }
    const r = row as Record<string, unknown>;
    const dealer_id =
      typeof r.dealer_id === "string" ? r.dealer_id.trim() : "";
    if (!isUuid(dealer_id)) {
      field_errors[`sales_prices.${idx}.dealer_id`] =
        "販売店を選択してください";
    } else if (seenDealers.has(dealer_id)) {
      field_errors[`sales_prices.${idx}.dealer_id`] =
        "同じ販売店が複数行に入力されています";
    } else {
      seenDealers.add(dealer_id);
    }

    const sales_price = parsePositiveNumber(
      r.sales_price,
      `sales_prices.${idx}.sales_price`,
      field_errors,
      "販売価格"
    );
    const start_date = parseOptionalDate(
      r.start_date,
      `sales_prices.${idx}.start_date`,
      field_errors
    );
    const end_date = parseOptionalDate(
      r.end_date,
      `sales_prices.${idx}.end_date`,
      field_errors
    );
    if (start_date && end_date && end_date < start_date) {
      field_errors[`sales_prices.${idx}.end_date`] =
        "適用終了日は適用開始日以降に設定してください";
    }
    const priceMemo = optionalTrimmed(
      r.memo,
      MAX_LONG,
      `sales_prices.${idx}.memo`,
      field_errors
    );
    let priceActive = true;
    if (r.is_active != null) {
      if (typeof r.is_active !== "boolean") {
        field_errors[`sales_prices.${idx}.is_active`] = "有効フラグが不正です";
      } else {
        priceActive = r.is_active;
      }
    }

    if (
      isUuid(dealer_id) &&
      sales_price != null &&
      !field_errors[`sales_prices.${idx}.end_date`]
    ) {
      sales_prices.push({
        dealer_id,
        sales_price,
        start_date,
        end_date,
        memo: priceMemo,
        is_active: priceActive,
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
    value: {
      product: {
        manufacturer_id,
        series_id,
        category,
        model_no,
        name,
        capacity,
        unit,
        memo,
        is_active,
        default_supplier_id,
      },
      purchase_prices,
      sales_prices,
    },
  };
}

export function buildCreateProductSetupRpcPayload(
  requestId: string,
  body: CreateProductSetupBody
): Record<string, unknown> {
  return {
    request_id: requestId,
    product: {
      manufacturer_id: body.product.manufacturer_id,
      series_id: body.product.series_id || null,
      category: body.product.category || null,
      model_no: body.product.model_no,
      name: body.product.name,
      capacity: body.product.capacity || null,
      unit: body.product.unit || null,
      memo: body.product.memo || null,
      is_active: body.product.is_active !== false,
      default_supplier_id: body.product.default_supplier_id,
    },
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
