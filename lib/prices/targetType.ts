/**
 * 価格マスタ共通: 価格対象種別
 * - PRODUCT: 商品
 * - PACKAGE: パッケージ商品
 */

export const PRICE_TARGET_TYPES = ["PRODUCT", "PACKAGE"] as const;

export type PriceTargetType = (typeof PRICE_TARGET_TYPES)[number];

export const PRICE_TARGET_OPTIONS: {
  value: PriceTargetType;
  label: string;
}[] = [
  { value: "PRODUCT", label: "商品" },
  { value: "PACKAGE", label: "パッケージ商品" },
];

export function isPriceTargetType(value: string): value is PriceTargetType {
  return (PRICE_TARGET_TYPES as readonly string[]).includes(value);
}

export function priceTargetLabel(type: PriceTargetType | string | null | undefined): string {
  if (type === "PACKAGE") return "パッケージ商品";
  if (type === "PRODUCT") return "商品";
  return "-";
}
