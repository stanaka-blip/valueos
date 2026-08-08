/** パッケージ一覧の検索・フィルタ（UIのみ。保存ルールは変更しない） */

export type PackageListStatusFilter = "all" | "active" | "inactive";

export type PackageListQuery = {
  q: string;
  manufacturerId: string;
  status: PackageListStatusFilter;
};

export type PackageListRow = {
  id: string;
  name: string | null;
  is_active: unknown;
  manufacturer_id?: string | null;
  manufacturerName: string;
  seriesName: string;
};

/** 現状一覧は有効・無効を両方表示。初期値は運用維持のため all */
export const DEFAULT_PACKAGE_LIST_STATUS: PackageListStatusFilter = "all";

export function parsePackageListStatus(
  value: string | null | undefined
): PackageListStatusFilter {
  if (value === "active" || value === "inactive" || value === "all") return value;
  return DEFAULT_PACKAGE_LIST_STATUS;
}

export function parsePackageListQuery(params: {
  q?: string;
  manufacturer_id?: string;
  status?: string;
}): PackageListQuery {
  return {
    q: (params.q || "").trim(),
    manufacturerId: (params.manufacturer_id || "").trim(),
    status: parsePackageListStatus(params.status),
  };
}

export function isPackageActiveFlag(value: unknown): boolean {
  return value === true || value === "true";
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return (haystack || "").toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

/** パッケージ名・メーカー名・シリーズ名のいずれかに部分一致 */
export function matchesPackageSearch(row: PackageListRow, q: string): boolean {
  const needle = q.trim();
  if (!needle) return true;
  return (
    includesIgnoreCase(row.name, needle) ||
    includesIgnoreCase(row.manufacturerName, needle) ||
    includesIgnoreCase(row.seriesName, needle)
  );
}

export function filterPackageListRows(
  rows: PackageListRow[],
  query: PackageListQuery
): PackageListRow[] {
  return rows.filter((row) => {
    if (query.manufacturerId && row.manufacturer_id !== query.manufacturerId) {
      return false;
    }
    if (query.status === "active" && !isPackageActiveFlag(row.is_active)) {
      return false;
    }
    if (query.status === "inactive" && isPackageActiveFlag(row.is_active)) {
      return false;
    }
    return matchesPackageSearch(row, query.q);
  });
}

/** 現状どおり名称順を基本に、メーカー → 名称 */
export function sortPackageListRows(rows: PackageListRow[]): PackageListRow[] {
  return [...rows].sort((a, b) => {
    const maker = a.manufacturerName.localeCompare(b.manufacturerName, "ja");
    if (maker !== 0) return maker;
    return (a.name || "").localeCompare(b.name || "", "ja");
  });
}
