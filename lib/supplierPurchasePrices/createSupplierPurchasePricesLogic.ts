/**
 * 仕入先起点仕入価格一括登録の入力検証・RPC payload 構築（純関数）。
 * PRODUCT / PACKAGE 両対応。既存価格行の UPDATE/DELETE はしない（INSERT のみ）。
 */

export type PurchasePriceBulkTargetType = "PRODUCT" | "PACKAGE";

export type SupplierPurchasePriceItemInput = {
  product_id?: string;
  package_id?: string;
  purchase_price: number;
  start_date?: string | null;
  end_date?: string | null;
  memo?: string | null;
  is_active?: boolean;
};

export type CreateSupplierPurchasePricesBody = {
  supplier_id: string;
  /** 省略時 PRODUCT（後方互換） */
  price_target_type?: PurchasePriceBulkTargetType;
  items: SupplierPurchasePriceItemInput[];
};

export type SupplierPurchasePriceFieldErrors = Record<string, string>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 200;
const MAX_LONG = 2000;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function parseTargetType(value: unknown): PurchasePriceBulkTargetType {
  if (value === "PACKAGE") return "PACKAGE";
  return "PRODUCT";
}

export function validateCreateSupplierPurchasePricesBody(
  body: unknown
):
  | { ok: true; value: CreateSupplierPurchasePricesBody }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: SupplierPurchasePriceFieldErrors;
    } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
    };
  }

  const input = body as Record<string, unknown>;
  const field_errors: SupplierPurchasePriceFieldErrors = {};
  const price_target_type = parseTargetType(input.price_target_type);

  const supplier_id =
    typeof input.supplier_id === "string" ? input.supplier_id.trim() : "";
  if (!isUuid(supplier_id)) {
    field_errors.supplier_id = "仕入先を選択してください";
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

  const items: SupplierPurchasePriceItemInput[] = [];
  const seenTargets = new Set<string>();

  input.items.forEach((row, idx) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      field_errors[`items.${idx}`] = "行が不正です";
      return;
    }
    const r = row as Record<string, unknown>;
    const product_id =
      typeof r.product_id === "string" ? r.product_id.trim() : "";
    const package_id =
      typeof r.package_id === "string" ? r.package_id.trim() : "";

    let targetId = "";
    if (price_target_type === "PACKAGE") {
      if (!isUuid(package_id)) {
        field_errors[`items.${idx}.package_id`] = "パッケージが不正です";
      } else if (seenTargets.has(package_id)) {
        field_errors[`items.${idx}.package_id`] =
          "同じパッケージが複数行に入力されています";
      } else {
        seenTargets.add(package_id);
        targetId = package_id;
      }
      if (product_id) {
        field_errors[`items.${idx}.product_id`] =
          "PACKAGE 指定時は product_id を指定できません";
      }
    } else {
      if (!isUuid(product_id)) {
        field_errors[`items.${idx}.product_id`] = "商品が不正です";
      } else if (seenTargets.has(product_id)) {
        field_errors[`items.${idx}.product_id`] =
          "同じ商品が複数行に入力されています";
      } else {
        seenTargets.add(product_id);
        targetId = product_id;
      }
      if (package_id) {
        field_errors[`items.${idx}.package_id`] =
          "PRODUCT 指定時は package_id を指定できません";
      }
    }

    const n =
      typeof r.purchase_price === "number"
        ? r.purchase_price
        : typeof r.purchase_price === "string" && r.purchase_price.trim() !== ""
          ? Number(r.purchase_price)
          : NaN;
    // 明示 0 円は有効。負数・非数のみ拒否。
    if (!Number.isFinite(n) || n < 0) {
      field_errors[`items.${idx}.purchase_price`] =
        "仕入価格は0円以上で入力してください";
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
      targetId &&
      Number.isFinite(n) &&
      n >= 0 &&
      !field_errors[`items.${idx}.end_date`] &&
      !field_errors[`items.${idx}.start_date`] &&
      !field_errors[`items.${idx}.product_id`] &&
      !field_errors[`items.${idx}.package_id`]
    ) {
      items.push({
        product_id: price_target_type === "PRODUCT" ? targetId : undefined,
        package_id: price_target_type === "PACKAGE" ? targetId : undefined,
        purchase_price: n,
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
    value: { supplier_id, price_target_type, items },
  };
}

export function buildCreateSupplierPurchasePricesRpcPayload(
  requestId: string,
  body: CreateSupplierPurchasePricesBody
): Record<string, unknown> {
  const price_target_type = body.price_target_type || "PRODUCT";
  return {
    request_id: requestId,
    supplier_id: body.supplier_id,
    price_target_type,
    items: body.items.map((item) => ({
      product_id:
        price_target_type === "PRODUCT" ? item.product_id || null : null,
      package_id:
        price_target_type === "PACKAGE" ? item.package_id || null : null,
      purchase_price: item.purchase_price,
      start_date: item.start_date || null,
      end_date: item.end_date || null,
      memo: item.memo || null,
      is_active: item.is_active !== false,
    })),
  };
}
