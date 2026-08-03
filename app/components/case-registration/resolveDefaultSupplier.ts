import type { LineType } from "./types";

export type SupplierResolvableProduct = {
  id: string;
  default_supplier_id: string | null;
};

export type SupplierResolvablePackage = {
  id: string;
  default_supplier_id: string | null;
};

/**
 * PRODUCT / PACKAGE の標準仕入先から supplier_id を解決する。
 * 販売店マスタの標準仕入先や仕入価格マスタからは推測しない。
 */
export function resolveDefaultSupplierId(
  lineType: LineType,
  productId: string,
  packageId: string,
  products: SupplierResolvableProduct[],
  packages: SupplierResolvablePackage[]
): string {
  if (lineType === "PRODUCT") {
    if (!productId) return "";
    return products.find((p) => p.id === productId)?.default_supplier_id || "";
  }
  if (!packageId) return "";
  return packages.find((p) => p.id === packageId)?.default_supplier_id || "";
}
