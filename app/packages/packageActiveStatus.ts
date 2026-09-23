/**
 * パッケージの利用停止 / 利用再開（soft）。
 * 物理DELETEはしない。過去案件・発注・価格は維持する。
 * packages.is_active は boolean 契約（商品の string 契約とは別）。
 */

import { isPackageActiveFlag } from "./packageListQuery";

export const PACKAGE_DEACTIVATE_CONFIRM =
  "このパッケージを利用停止します。\n過去の案件・発注履歴には残りますが、\n今後のパッケージ選択候補には表示されません。";

export const PACKAGE_REACTIVATE_CONFIRM =
  "このパッケージを利用再開します。\n今後の案件登録等の選択候補に再び表示されます。";

/** packages.is_active への書き込み値（boolean） */
export function toPackageActiveDbValue(isActive: boolean): boolean {
  return isActive;
}

export function packageStatusLabel(isActive: unknown): "有効" | "利用停止" {
  return isPackageActiveFlag(isActive) ? "有効" : "利用停止";
}

export function packageStatusBadgeClass(isActive: unknown): string {
  return isPackageActiveFlag(isActive)
    ? "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
    : "rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-700";
}

export function nextPackageActiveValue(currentlyActive: boolean): boolean {
  return !currentlyActive;
}
