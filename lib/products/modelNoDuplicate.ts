/**
 * 同一型番の複数商品登録（soft uniqueness）。
 * DB unique は無く、アプリ側の Warning + 登録許可で扱う。
 */

export type ModelNoDuplicateHit = {
  id: string;
  name: string | null;
  category: string | null;
  model_no: string | null;
  is_active?: unknown;
};

export function hasModelNoDuplicateHits(
  rows: readonly ModelNoDuplicateHit[] | null | undefined
): boolean {
  return Array.isArray(rows) && rows.length > 0;
}
