/**
 * 仕入/販売価格一覧の検索・フィルター（UIのみ。保存ルールは変更しない）
 */

import { isProductActiveFlag } from "@/app/products/productListQuery";
import { isPriceTargetType, type PriceTargetType } from "@/lib/prices/targetType";

export type PriceListStatusFilter = "all" | "active" | "inactive";

export type PriceListQuery = {
  q: string;
  /** /prices: supplier_id / /sales-prices: dealer_id */
  partnerId: string;
  manufacturerId: string;
  priceTargetType: "" | PriceTargetType;
  category: string;
  status: PriceListStatusFilter;
};

export type PriceListFilterRow = {
  id: string;
  partnerId: string | null;
  manufacturerId: string | null;
  manufacturerName: string;
  priceTargetType: string;
  /** 一覧の「区分」表示値（PRODUCT=category / PACKAGE=system_type||capacity） */
  category: string;
  code: string;
  name: string;
  is_active: unknown;
};

export const DEFAULT_PRICE_LIST_STATUS: PriceListStatusFilter = "all";

export function parsePriceListStatus(
  value: string | null | undefined
): PriceListStatusFilter {
  if (value === "active" || value === "inactive" || value === "all") return value;
  return DEFAULT_PRICE_LIST_STATUS;
}

export function parsePriceListQuery(params: {
  q?: string;
  supplier_id?: string;
  dealer_id?: string;
  manufacturer_id?: string;
  price_target_type?: string;
  category?: string;
  status?: string;
  /** partner キーを明示（supplier_id / dealer_id） */
  partnerParam?: "supplier_id" | "dealer_id";
}): PriceListQuery {
  const partnerParam = params.partnerParam || "supplier_id";
  const partnerRaw =
    partnerParam === "dealer_id" ? params.dealer_id : params.supplier_id;
  const target = (params.price_target_type || "").trim();
  return {
    q: (params.q || "").trim(),
    partnerId: (partnerRaw || "").trim(),
    manufacturerId: (params.manufacturer_id || "").trim(),
    priceTargetType: isPriceTargetType(target) ? target : "",
    category: (params.category || "").trim(),
    status: parsePriceListStatus(params.status),
  };
}

function includesIgnoreCase(
  haystack: string | null | undefined,
  needle: string
): boolean {
  if (!needle) return true;
  return (haystack || "")
    .toLocaleLowerCase()
    .includes(needle.toLocaleLowerCase());
}

/** 型番/コード・名称・メーカー名の部分一致 */
export function matchesPriceListSearch(
  row: PriceListFilterRow,
  q: string
): boolean {
  const needle = q.trim();
  if (!needle) return true;
  return (
    includesIgnoreCase(row.code, needle) ||
    includesIgnoreCase(row.name, needle) ||
    includesIgnoreCase(row.manufacturerName, needle)
  );
}

export function filterPriceListRows(
  rows: PriceListFilterRow[],
  query: PriceListQuery
): PriceListFilterRow[] {
  return rows.filter((row) => {
    if (query.partnerId && (row.partnerId || "") !== query.partnerId) {
      return false;
    }
    if (
      query.manufacturerId &&
      (row.manufacturerId || "") !== query.manufacturerId
    ) {
      return false;
    }
    if (
      query.priceTargetType &&
      row.priceTargetType !== query.priceTargetType
    ) {
      return false;
    }
    if (query.category && (row.category || "") !== query.category) {
      return false;
    }
    if (query.status === "active" && !isProductActiveFlag(row.is_active)) {
      return false;
    }
    if (query.status === "inactive" && isProductActiveFlag(row.is_active)) {
      return false;
    }
    return matchesPriceListSearch(row, query.q);
  });
}

/** メーカー選択時は当該メーカー行からカテゴリ候補を作る */
export function collectPriceListCategories(
  rows: PriceListFilterRow[],
  manufacturerId?: string
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (
      manufacturerId &&
      (row.manufacturerId || "") !== manufacturerId
    ) {
      continue;
    }
    const c = (row.category || "").trim();
    if (c && c !== "-") set.add(c);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}
