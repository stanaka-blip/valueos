/**
 * パッケージ一括登録の入力検証・RPC payload 構築（純関数）。
 */

export type PackageBulkItemInput = {
  product_id: string;
  quantity: number;
};

export type PackageBulkPackageInput = {
  name: string;
  capacity?: number | null;
  capacity_unit?: string | null;
  warranty_years?: number | null;
  default_supplier_id?: string | null;
  memo?: string | null;
  is_active?: boolean;
  items: PackageBulkItemInput[];
};

export type CreatePackageBulkSetupBody = {
  manufacturer_id: string;
  series_id?: string | null;
  packages: PackageBulkPackageInput[];
};

export type PackageBulkFieldErrors = Record<string, string>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PACKAGES = 50;
const MAX_ITEMS = 50;
const MAX_SHORT = 200;
const MAX_LONG = 2000;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

export function validateCreatePackageBulkSetupBody(
  body: unknown
):
  | { ok: true; value: CreatePackageBulkSetupBody }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: PackageBulkFieldErrors;
    } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
    };
  }

  const input = body as Record<string, unknown>;
  const field_errors: PackageBulkFieldErrors = {};

  const manufacturer_id =
    typeof input.manufacturer_id === "string"
      ? input.manufacturer_id.trim()
      : "";
  if (!isUuid(manufacturer_id)) {
    field_errors.manufacturer_id = "メーカーを選択してください";
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

  if (!Array.isArray(input.packages)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "packages は配列である必要があります",
      field_errors: { packages: "packages は配列である必要があります" },
    };
  }
  if (input.packages.length < 1) {
    field_errors.packages = "パッケージが1件以上必要です";
  }
  if (input.packages.length > MAX_PACKAGES) {
    field_errors.packages = "パッケージ件数が上限を超えています";
  }

  const packages: PackageBulkPackageInput[] = [];
  const seenNames = new Set<string>();

  input.packages.forEach((pkg, pkgIdx) => {
    if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
      field_errors[`packages.${pkgIdx}`] = "行が不正です";
      return;
    }
    const p = pkg as Record<string, unknown>;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) {
      field_errors[`packages.${pkgIdx}.name`] = "パッケージ名は必須です";
    } else if (name.length > MAX_SHORT) {
      field_errors[`packages.${pkgIdx}.name`] = "パッケージ名が長すぎます";
    } else {
      const key = name.toLocaleLowerCase();
      if (seenNames.has(key)) {
        field_errors[`packages.${pkgIdx}.name`] =
          "同じパッケージ名が複数行に入力されています";
      } else {
        seenNames.add(key);
      }
    }

    let capacity: number | null = null;
    if (p.capacity != null && String(p.capacity).trim() !== "") {
      const n = toNumber(p.capacity);
      if (!Number.isFinite(n) || n < 0) {
        field_errors[`packages.${pkgIdx}.capacity`] = "容量が不正です";
      } else {
        capacity = n;
      }
    }

    let capacity_unit: string | null = null;
    if (p.capacity_unit != null && String(p.capacity_unit).trim() !== "") {
      capacity_unit = String(p.capacity_unit).trim();
      if (capacity_unit.length > MAX_SHORT) {
        field_errors[`packages.${pkgIdx}.capacity_unit`] =
          "容量単位が長すぎます";
      }
    }

    let warranty_years: number | null = null;
    if (p.warranty_years != null && String(p.warranty_years).trim() !== "") {
      const n = toNumber(p.warranty_years);
      if (!Number.isFinite(n) || n < 0) {
        field_errors[`packages.${pkgIdx}.warranty_years`] =
          "保証年数が不正です";
      } else {
        warranty_years = n;
      }
    }

    let default_supplier_id: string | null = null;
    if (
      p.default_supplier_id != null &&
      String(p.default_supplier_id).trim() !== ""
    ) {
      const s = String(p.default_supplier_id).trim();
      if (!isUuid(s)) {
        field_errors[`packages.${pkgIdx}.default_supplier_id`] =
          "標準仕入先が不正です";
      } else {
        default_supplier_id = s;
      }
    }

    let memo: string | null = null;
    if (p.memo != null && String(p.memo).trim() !== "") {
      memo = String(p.memo).trim();
      if (memo.length > MAX_LONG) {
        field_errors[`packages.${pkgIdx}.memo`] = "メモが長すぎます";
      }
    }

    let is_active = true;
    if (p.is_active != null) {
      if (typeof p.is_active !== "boolean") {
        field_errors[`packages.${pkgIdx}.is_active`] = "有効フラグが不正です";
      } else {
        is_active = p.is_active;
      }
    }

    if (!Array.isArray(p.items)) {
      field_errors[`packages.${pkgIdx}.items`] =
        "構成商品は配列である必要があります";
      return;
    }
    if (p.items.length < 1) {
      field_errors[`packages.${pkgIdx}.items`] = "構成商品が1件以上必要です";
    }
    if (p.items.length > MAX_ITEMS) {
      field_errors[`packages.${pkgIdx}.items`] =
        "構成商品数が上限を超えています";
    }

    const items: PackageBulkItemInput[] = [];
    const seenProducts = new Set<string>();
    p.items.forEach((item, itemIdx) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        field_errors[`packages.${pkgIdx}.items.${itemIdx}`] = "行が不正です";
        return;
      }
      const r = item as Record<string, unknown>;
      const product_id =
        typeof r.product_id === "string" ? r.product_id.trim() : "";
      if (!isUuid(product_id)) {
        field_errors[`packages.${pkgIdx}.items.${itemIdx}.product_id`] =
          "商品が不正です";
      } else if (seenProducts.has(product_id)) {
        field_errors[`packages.${pkgIdx}.items.${itemIdx}.product_id`] =
          "同じ商品が複数行に入力されています";
      } else {
        seenProducts.add(product_id);
      }

      const quantity = toNumber(r.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        field_errors[`packages.${pkgIdx}.items.${itemIdx}.quantity`] =
          "数量は1以上で入力してください";
      }

      if (
        isUuid(product_id) &&
        Number.isFinite(quantity) &&
        quantity > 0 &&
        !field_errors[`packages.${pkgIdx}.items.${itemIdx}.product_id`]
      ) {
        items.push({ product_id, quantity });
      }
    });

    if (
      name &&
      !field_errors[`packages.${pkgIdx}.name`] &&
      items.length > 0 &&
      !field_errors[`packages.${pkgIdx}.items`]
    ) {
      packages.push({
        name,
        capacity,
        capacity_unit,
        warranty_years,
        default_supplier_id,
        memo,
        is_active,
        items,
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
    value: { manufacturer_id, series_id, packages },
  };
}

export function buildCreatePackageBulkSetupRpcPayload(
  requestId: string,
  body: CreatePackageBulkSetupBody
): Record<string, unknown> {
  return {
    request_id: requestId,
    manufacturer_id: body.manufacturer_id,
    series_id: body.series_id || null,
    packages: body.packages.map((pkg) => ({
      name: pkg.name,
      capacity: pkg.capacity ?? null,
      capacity_unit: pkg.capacity_unit || "kWh",
      warranty_years: pkg.warranty_years ?? null,
      default_supplier_id: pkg.default_supplier_id || null,
      memo: pkg.memo || null,
      is_active: pkg.is_active !== false,
      items: pkg.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      })),
    })),
  };
}
