/**
 * 検索可能セレクト用の純関数（UI は SearchableSelect.tsx）。
 * 候補集合そのものは呼び出し側が既存条件で絞ったものを渡す。
 */

export type SearchableSelectOption = {
  id: string;
  /** 選択後に表示するラベル（型番・名称など） */
  label: string;
  /** 候補リスト1行目 */
  primaryText: string;
  /** 候補リスト2行目（メーカー｜カテゴリなど） */
  secondaryText?: string;
  /** 検索対象を結合した文字列 */
  searchText: string;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** 部分一致・大小文字無視。空クエリは全件ヒット */
export function matchesSearchableQuery(
  searchText: string,
  query: string
): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return normalize(searchText).includes(needle);
}

export function filterSearchableOptions<T extends SearchableSelectOption>(
  options: T[],
  query: string,
  limit = 80
): T[] {
  const matched = options.filter((option) =>
    matchesSearchableQuery(option.searchText, query)
  );
  return matched.slice(0, limit);
}

export type ProductSearchSource = {
  id: string;
  name: string;
  model_no: string | null;
  manufacturer_name?: string | null;
  category?: string | null;
  series_name?: string | null;
};

export function formatProductOptionLabel(product: ProductSearchSource): string {
  const name = (product.name || "").trim() || "名称未設定";
  const model = (product.model_no || "").trim();
  return model ? `${name}（${model}）` : name;
}

export function buildProductSearchOption(
  product: ProductSearchSource
): SearchableSelectOption {
  const name = (product.name || "").trim() || "名称未設定";
  const model = (product.model_no || "").trim();
  const manufacturer = (product.manufacturer_name || "").trim();
  const category = (product.category || "").trim();
  const series = (product.series_name || "").trim();

  const secondaryParts = [manufacturer, category, series].filter(Boolean);

  return {
    id: product.id,
    label: formatProductOptionLabel(product),
    primaryText: model ? `${model} ｜ ${name}` : name,
    secondaryText: secondaryParts.length > 0 ? secondaryParts.join(" ｜ ") : undefined,
    searchText: [model, name, manufacturer, category, series]
      .filter(Boolean)
      .join(" "),
  };
}

export type PackageSearchSource = {
  id: string;
  name: string;
  package_code: string | null;
};

export function formatPackageOptionLabel(pkg: PackageSearchSource): string {
  const name = (pkg.name || "").trim() || "名称未設定";
  const code = (pkg.package_code || "").trim();
  return code ? `${name}（${code}）` : name;
}

export function buildPackageSearchOption(
  pkg: PackageSearchSource
): SearchableSelectOption {
  const name = (pkg.name || "").trim() || "名称未設定";
  const code = (pkg.package_code || "").trim();
  return {
    id: pkg.id,
    label: formatPackageOptionLabel(pkg),
    primaryText: code ? `${code} ｜ ${name}` : name,
    secondaryText: undefined,
    searchText: [code, name].filter(Boolean).join(" "),
  };
}

/** 商品複製でコピーしてよいフィールド（価格・履歴・関連は含めない） */
export type ProductCopySource = {
  manufacturer_id: string | null;
  series_id: string | null;
  category: string | null;
  model_no: string | null;
  name: string | null;
  capacity: string | null;
  unit: string | null;
  memo: string | null;
  is_active: unknown;
  default_supplier_id: string | null;
};

export type ProductCopyFormValues = {
  manufacturer_id: string;
  series_id: string;
  category: string;
  model_no: string;
  name: string;
  capacity: string;
  unit: string;
  memo: string;
  is_active: boolean;
  default_supplier_id: string;
};

export function buildProductCopyFormValues(
  source: ProductCopySource
): ProductCopyFormValues {
  const isActive =
    source.is_active === true ||
    source.is_active === "true" ||
    source.is_active == null;

  return {
    manufacturer_id: source.manufacturer_id || "",
    series_id: source.series_id || "",
    category: (source.category || "").trim(),
    model_no: (source.model_no || "").trim(),
    name: (source.name || "").trim(),
    capacity: (source.capacity || "").trim(),
    unit: (source.unit || "").trim(),
    memo: (source.memo || "").trim(),
    is_active: isActive,
    default_supplier_id: source.default_supplier_id || "",
  };
}

export const DUPLICATE_MODEL_NO_MESSAGE =
  "同じメーカー・同じ型番の商品がすでに登録されています。型番を変更してから保存してください。";
