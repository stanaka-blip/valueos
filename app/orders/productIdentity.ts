/**
 * 発注明細の現場表示用：メーカー＋型番（商品名は使わない）。
 * DB列追加なし。products / manufacturers の既存データを参照。
 */

export type ManufacturerRelation =
  | { name?: string | null }
  | { name?: string | null }[]
  | null
  | undefined;

export type ProductIdentitySource = {
  model_no?: string | null;
  manufacturers?: ManufacturerRelation;
} | null
  | undefined;

function getSingleRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0] || null;
  return relation;
}

/** manufacturers.name を取り出す */
export function resolveManufacturerName(
  manufacturers: ManufacturerRelation
): string {
  const row = getSingleRelation(manufacturers);
  return String(row?.name || "").trim();
}

/** products.model_no を型番として取り出す */
export function resolveModelNo(
  product: { model_no?: string | null } | null | undefined
): string {
  return String(product?.model_no || "").trim();
}

export function resolveProductIdentity(product: ProductIdentitySource): {
  manufacturerName: string;
  modelNo: string;
} {
  return {
    manufacturerName: resolveManufacturerName(product?.manufacturers),
    modelNo: resolveModelNo(product),
  };
}

/** 空表示の統一 */
export function displayIdentityValue(value: string | null | undefined): string {
  const v = String(value || "").trim();
  return v || "—";
}
