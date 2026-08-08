/** 商品一覧の検索・フィルタ（UIのみ。保存ルールは変更しない） */

export type ProductListStatusFilter = "all" | "active" | "inactive";

export type ProductListQuery = {
  q: string;
  manufacturerId: string;
  category: string;
  status: ProductListStatusFilter;
};

export type ProductListRow = {
  id: string;
  name: string | null;
  category: string | null;
  model_no: string | null;
  is_active: unknown;
  manufacturer_id?: string | null;
  manufacturerName: string;
};

/** 現状一覧は有効・無効を両方表示。初期値は運用維持のため all */
export const DEFAULT_PRODUCT_LIST_STATUS: ProductListStatusFilter = "all";

export function parseProductListStatus(
  value: string | null | undefined
): ProductListStatusFilter {
  if (value === "active" || value === "inactive" || value === "all") return value;
  return DEFAULT_PRODUCT_LIST_STATUS;
}

export function parseProductListQuery(params: {
  q?: string;
  manufacturer_id?: string;
  category?: string;
  status?: string;
}): ProductListQuery {
  return {
    q: (params.q || "").trim(),
    manufacturerId: (params.manufacturer_id || "").trim(),
    category: (params.category || "").trim(),
    status: parseProductListStatus(params.status),
  };
}

export function isProductActiveFlag(value: unknown): boolean {
  return value === true || value === "true";
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return (haystack || "").toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

/** 型番・商品名・メーカー名のいずれかに部分一致 */
export function matchesProductSearch(row: ProductListRow, q: string): boolean {
  const needle = q.trim();
  if (!needle) return true;
  return (
    includesIgnoreCase(row.model_no, needle) ||
    includesIgnoreCase(row.name, needle) ||
    includesIgnoreCase(row.manufacturerName, needle)
  );
}

export function filterProductListRows(
  rows: ProductListRow[],
  query: ProductListQuery
): ProductListRow[] {
  return rows.filter((row) => {
    if (query.manufacturerId && row.manufacturer_id !== query.manufacturerId) {
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
    return matchesProductSearch(row, query.q);
  });
}

/** 使いやすさ優先: メーカー名 → 型番 → 商品名（保存順は変更しない） */
export function sortProductListRows(rows: ProductListRow[]): ProductListRow[] {
  return [...rows].sort((a, b) => {
    const maker = a.manufacturerName.localeCompare(b.manufacturerName, "ja");
    if (maker !== 0) return maker;
    const model = (a.model_no || "").localeCompare(b.model_no || "", "ja");
    if (model !== 0) return model;
    return (a.name || "").localeCompare(b.name || "", "ja");
  });
}
