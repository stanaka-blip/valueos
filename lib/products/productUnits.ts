/**
 * 商品単位（products.unit）の標準候補。
 * DB は free-text のまま。UI は select + 既存値 merge。
 */

/** 現場要望の標準候補（順序固定）。既存 kWh も維持 */
export const STANDARD_PRODUCT_UNITS = [
  "枚",
  "kW",
  "台",
  "個",
  "本",
  "式",
  "kWh",
] as const;

export type StandardProductUnit = (typeof STANDARD_PRODUCT_UNITS)[number];

/**
 * select 用 options。
 * currentUnit が標準外でも先頭に残し、編集時の空欄化を防ぐ。
 */
export function getProductUnitSelectOptions(
  currentUnit?: string | null
): string[] {
  const options: string[] = [...STANDARD_PRODUCT_UNITS];
  const current = (currentUnit || "").trim();
  if (current && !options.includes(current)) {
    options.unshift(current);
  }
  return options;
}

export function normalizeProductUnitInput(
  value: string | null | undefined
): string | null {
  const trimmed = (value || "").trim();
  return trimmed || null;
}
