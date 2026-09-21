/**
 * products.is_active の書き込み・新規選択ガード契約。
 * - DB 書き込み: "true" | "false"（string）
 * - 判定: isProductActiveFlag（true / "true" のみ active。null は inactive）
 * - dealer / supplier 等の他テーブル契約は対象外
 */

import { isProductActiveFlag } from "@/app/products/productListQuery";
import {
  buildProductSearchOption,
  type ProductSearchSource,
  type SearchableSelectOption,
} from "@/app/components/masters/searchableSelect";

export const PRODUCT_INACTIVE_SELECT_MESSAGE =
  "この商品は利用停止中のため選択できません。";

export const PACKAGE_INACTIVE_SELECT_MESSAGE =
  "このパッケージは利用停止中のため登録できません。";

/** products.is_active への書き込み値（string 契約） */
export function toProductActiveDbValue(
  isActive: boolean
): "true" | "false" {
  return isActive ? "true" : "false";
}

export type PackageCompositionProduct = ProductSearchSource & {
  manufacturer_id?: string | null;
  is_active: unknown;
};

/**
 * package 構成の1行向け候補。
 * - active: 常に候補
 * - inactive: その行で現在選択中の商品のみ表示維持（他行への新規追加は不可）
 */
export function filterProductsForPackageLineSelect<
  T extends { id: string; manufacturer_id?: string | null; is_active: unknown },
>(
  products: readonly T[],
  lineProductId: string,
  manufacturerId: string
): T[] {
  const selectedId = (lineProductId || "").trim();
  const maker = (manufacturerId || "").trim();
  return products.filter((row) => {
    if (maker && (row.manufacturer_id || "") !== maker) return false;
    if (isProductActiveFlag(row.is_active)) return true;
    return selectedId !== "" && row.id === selectedId;
  });
}

export function buildPackageCompositionProductOption(
  product: PackageCompositionProduct
): SearchableSelectOption {
  const base = buildProductSearchOption(product);
  if (isProductActiveFlag(product.is_active)) return base;
  return {
    ...base,
    label: `${base.label}（利用停止）`,
    primaryText: `${base.primaryText}（利用停止）`,
    searchText: `${base.searchText} 利用停止`,
  };
}

/**
 * 新規選択の product_id が active か検証。
 * allowedInactiveIds に含まれる既存紐付けは再保存を許可。
 */
export function assertNewProductSelectionsActive(
  selectedProductIds: readonly string[],
  isActiveById: ReadonlyMap<string, unknown>,
  allowedInactiveIds: ReadonlySet<string> = new Set()
): { ok: true } | { ok: false; message: string; productId: string } {
  for (const rawId of selectedProductIds) {
    const id = (rawId || "").trim();
    if (!id) continue;
    if (allowedInactiveIds.has(id)) continue;
    const flag = isActiveById.get(id);
    if (flag === undefined) {
      return {
        ok: false,
        message: PRODUCT_INACTIVE_SELECT_MESSAGE,
        productId: id,
      };
    }
    if (!isProductActiveFlag(flag)) {
      return {
        ok: false,
        message: PRODUCT_INACTIVE_SELECT_MESSAGE,
        productId: id,
      };
    }
  }
  return { ok: true };
}

/** 案件登録 lines から PRODUCT の product_id を抽出 */
export function collectProductIdsFromCaseRegistrationLines(
  lines: unknown
): string[] {
  if (!Array.isArray(lines)) return [];
  const ids: string[] = [];
  for (const row of lines) {
    if (!row || typeof row !== "object") continue;
    const line = row as Record<string, unknown>;
    const type =
      typeof line.line_type === "string"
        ? line.line_type.trim().toUpperCase()
        : "";
    if (type !== "PRODUCT") continue;
    const productId =
      typeof line.product_id === "string" ? line.product_id.trim() : "";
    if (productId) ids.push(productId);
  }
  return ids;
}

/** 案件登録 lines から PACKAGE の package_id を抽出 */
export function collectPackageIdsFromCaseRegistrationLines(
  lines: unknown
): string[] {
  if (!Array.isArray(lines)) return [];
  const ids: string[] = [];
  for (const row of lines) {
    if (!row || typeof row !== "object") continue;
    const line = row as Record<string, unknown>;
    const type =
      typeof line.line_type === "string"
        ? line.line_type.trim().toUpperCase()
        : "";
    if (type !== "PACKAGE") continue;
    const packageId =
      typeof line.package_id === "string" ? line.package_id.trim() : "";
    if (packageId) ids.push(packageId);
  }
  return ids;
}

/**
 * 新規選択の package_id が active か検証。
 * allowedInactiveIds に含まれる既存紐付けは再保存を許可（案件登録 formal では空）。
 */
export function assertNewPackageSelectionsActive(
  selectedPackageIds: readonly string[],
  isActiveById: ReadonlyMap<string, unknown>,
  allowedInactiveIds: ReadonlySet<string> = new Set()
): { ok: true } | { ok: false; message: string; packageId: string } {
  for (const rawId of selectedPackageIds) {
    const id = (rawId || "").trim();
    if (!id) continue;
    if (allowedInactiveIds.has(id)) continue;
    const flag = isActiveById.get(id);
    if (flag === undefined) {
      return {
        ok: false,
        message: PACKAGE_INACTIVE_SELECT_MESSAGE,
        packageId: id,
      };
    }
    if (!isProductActiveFlag(flag)) {
      return {
        ok: false,
        message: PACKAGE_INACTIVE_SELECT_MESSAGE,
        packageId: id,
      };
    }
  }
  return { ok: true };
}

/**
 * 発注明細: 既存行の保持は許可し、新規行（id なし）の product_id のみ active 必須。
 */
export function collectNewOrderProductIds(params: {
  existingIds: ReadonlySet<string>;
  incoming: ReadonlyArray<{ id?: string | null; product_id?: string | null }>;
}): string[] {
  const ids: string[] = [];
  for (const row of params.incoming) {
    const existingId = (row.id || "").trim();
    if (existingId && params.existingIds.has(existingId)) continue;
    const productId = (row.product_id || "").trim();
    if (productId) ids.push(productId);
  }
  return ids;
}
