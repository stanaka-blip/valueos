/**
 * パッケージ「複製して新規登録」の form 初期値（純関数）。
 * id / timestamps / 価格マスタは含めない。構成は product_id + quantity のみ。
 */

export type PackageCopySource = {
  manufacturer_id: string | null;
  series_id: string | null;
  name: string | null;
  package_code: string | null;
  capacity: number | string | null;
  capacity_unit: string | null;
  system_type: string | null;
  warranty_years: number | string | null;
  memo: string | null;
  default_supplier_id: string | null;
  is_active?: unknown;
};

export type PackageCopyLineSource = {
  product_id: string | null;
  quantity: number | string | null;
};

export type PackageCopyFormValues = {
  manufacturer_id: string;
  series_id: string;
  name: string;
  package_code: string;
  capacity: string;
  capacity_unit: string;
  system_type: string;
  warranty_years: string;
  memo: string;
  is_active: boolean;
  default_supplier_id: string;
};

export type PackageCopyLineForm = {
  product_id: string;
  quantity: string;
};

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * 複製元が利用停止でも、新規パッケージは常に有効として作成する
 * （商品複製 buildProductCopyFormValues と同趣旨）。
 */
export function buildPackageCopyFormValues(
  source: PackageCopySource
): PackageCopyFormValues {
  return {
    manufacturer_id: source.manufacturer_id || "",
    series_id: source.series_id || "",
    name: asString(source.name),
    package_code: asString(source.package_code),
    capacity: asString(source.capacity),
    capacity_unit: asString(source.capacity_unit) || "kWh",
    system_type: asString(source.system_type),
    warranty_years: asString(source.warranty_years),
    memo: asString(source.memo),
    is_active: true,
    default_supplier_id: source.default_supplier_id || "",
  };
}

/** 構成行。空 product_id は落とす。quantity は文字列で保持 */
export function buildPackageCopyLines(
  items: readonly PackageCopyLineSource[]
): PackageCopyLineForm[] {
  const lines: PackageCopyLineForm[] = [];
  for (const item of items) {
    const productId = (item.product_id || "").trim();
    if (!productId) continue;
    const qty = asString(item.quantity);
    lines.push({
      product_id: productId,
      quantity: qty && Number(qty) > 0 ? qty : "1",
    });
  }
  return lines.length > 0 ? lines : [{ product_id: "", quantity: "1" }];
}

export const PACKAGE_COPY_NOTICE =
  "元パッケージの内容・構成を初期表示しています。名称・コードなどを必要に応じて変更し、新規パッケージとして保存してください（仕入価格・販売価格はコピーされません）。";
