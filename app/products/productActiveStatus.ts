/**
 * 商品の利用停止 / 利用再開（soft）。
 * 物理DELETEはしない。過去案件・発注・価格は維持する。
 */

import { toProductActiveDbValue } from "@/lib/products/productActiveContract";

import { isProductActiveFlag } from "./productListQuery";

export const PRODUCT_DEACTIVATE_CONFIRM =
  "この商品を利用停止します。\n過去の案件・発注履歴には残りますが、\n今後の商品選択候補には表示されません。";

export const PRODUCT_REACTIVATE_CONFIRM =
  "この商品を利用再開します。\n今後の案件登録・パッケージ等の選択候補に再び表示されます。";

/** products.is_active 書き込み値（"true" / "false"） */
export { toProductActiveDbValue };

export function productStatusLabel(isActive: unknown): "有効" | "利用停止" {
  return isProductActiveFlag(isActive) ? "有効" : "利用停止";
}

export function productStatusBadgeClass(isActive: unknown): string {
  return isProductActiveFlag(isActive)
    ? "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
    : "rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-700";
}

/** 一覧行の視認性を保ちつつ利用停止を区別する */
export function productListRowClassName(isActive: unknown): string {
  const base = "border-t hover:bg-gray-50";
  if (isProductActiveFlag(isActive)) return base;
  return `${base} bg-gray-50/80 text-gray-700`;
}

export function nextProductActiveValue(currentlyActive: boolean): boolean {
  return !currentlyActive;
}
