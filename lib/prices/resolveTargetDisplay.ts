/**
 * 仕入/販売価格一覧の PRODUCT / PACKAGE 表示マッピング。
 * 既存一覧の表示ロジックを共通化しただけ（保存ルールは変更しない）。
 */

export type ManufacturerRel =
  | { name: string | null }
  | { name: string | null }[]
  | null;

export type ProductRel = {
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturer_id?: string | null;
  manufacturers: ManufacturerRel;
} | null;

export type PackageRel = {
  name: string | null;
  package_code: string | null;
  capacity: number | string | null;
  capacity_unit: string | null;
  system_type: string | null;
  manufacturer_id?: string | null;
  manufacturers: ManufacturerRel;
} | null;

export type TargetDisplay = {
  maker: string;
  category: string;
  code: string;
  name: string;
  manufacturerId: string | null;
};

function relationName(value: ManufacturerRel): string {
  if (!value) return "";
  const row = Array.isArray(value) ? value[0] : value;
  return (row?.name || "").trim();
}

export function resolveTargetDisplay(
  targetType: string,
  product: ProductRel,
  pkg: PackageRel
): TargetDisplay {
  if (targetType === "PACKAGE") {
    const capacity =
      pkg?.capacity != null && pkg.capacity !== ""
        ? `${pkg.capacity}${pkg.capacity_unit || ""}`
        : "-";
    return {
      maker: relationName(pkg?.manufacturers ?? null) || "-",
      category: pkg?.system_type || capacity,
      code: pkg?.package_code || "-",
      name: pkg?.name || "-",
      manufacturerId: (pkg?.manufacturer_id || "").trim() || null,
    };
  }

  return {
    maker: relationName(product?.manufacturers ?? null) || "-",
    category: product?.category || "-",
    code: product?.model_no || "-",
    name: product?.name || "-",
    manufacturerId: (product?.manufacturer_id || "").trim() || null,
  };
}
