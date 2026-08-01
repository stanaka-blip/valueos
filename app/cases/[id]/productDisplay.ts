/**
 * 案件詳細の商品明細表示（表示専用）。
 * PRODUCT / PACKAGE の区別と、NULL 価格の「未設定」表示を担う。
 */

export type CaseProductLineType = "PRODUCT" | "PACKAGE";

export type CaseProductDisplayInput = {
  line_type?: string | null;
  product_id?: string | null;
  package_id?: string | null;
  quantity?: number | string | null;
  purchase_price?: number | string | null;
  sales_price?: number | string | null;
  gross_profit?: number | string | null;
  memo?: string | null;
  productName?: string | null;
  packageName?: string | null;
  modelNo?: string | null;
  category?: string | null;
  manufacturerName?: string | null;
  supplierName?: string | null;
};

export type CaseProductDisplayRow = {
  id: string;
  lineType: CaseProductLineType;
  lineTypeLabel: string;
  /** 商品名またはパッケージ名 */
  displayName: string;
  nameLabel: string;
  modelNo: string;
  category: string;
  manufacturerName: string;
  supplierName: string;
  quantity: string;
  purchasePrice: number | null;
  salesPrice: number | null;
  grossProfit: number | null;
  memo: string;
};

/** DB/JSON の数値を null と 0 を区別して返す */
export function toNullableNumber(
  value: number | string | null | undefined
): number | null {
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * NULL は「—」（未設定）。実在の 0 は「0円」。
 */
export function formatNullableYen(
  value: number | null | undefined,
  unsetLabel = "—"
): string {
  if (value == null) {
    return unsetLabel;
  }
  return new Intl.NumberFormat("ja-JP").format(Math.round(value)) + "円";
}

export function normalizeLineType(
  value: string | null | undefined
): CaseProductLineType {
  const t = String(value || "").trim().toUpperCase();
  return t === "PACKAGE" ? "PACKAGE" : "PRODUCT";
}

export function lineTypeLabel(lineType: CaseProductLineType): string {
  return lineType === "PACKAGE" ? "パッケージ" : "商品";
}

export function resolveDisplayName(
  lineType: CaseProductLineType,
  productName: string | null | undefined,
  packageName: string | null | undefined
): string {
  if (lineType === "PACKAGE") {
    return (packageName || "").trim();
  }
  return (productName || "").trim();
}

export function nameFieldLabel(lineType: CaseProductLineType): string {
  return lineType === "PACKAGE" ? "パッケージ名" : "商品名";
}

/** 合計用。null は 0 として加算し NaN を出さない */
export function sumNullableAmounts(
  values: Array<number | null | undefined>
): number {
  let total = 0;
  for (const v of values) {
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

export function formatProfitRate(
  salesPrice: number | null,
  grossProfit: number | null
): string {
  if (salesPrice == null || salesPrice <= 0 || grossProfit == null) {
    return "—";
  }
  return `${((grossProfit / salesPrice) * 100).toFixed(1)}%`;
}

export function toCaseProductDisplayRow(
  id: string,
  input: CaseProductDisplayInput
): CaseProductDisplayRow {
  const lineType = normalizeLineType(input.line_type);
  return {
    id,
    lineType,
    lineTypeLabel: lineTypeLabel(lineType),
    displayName: resolveDisplayName(
      lineType,
      input.productName,
      input.packageName
    ),
    nameLabel: nameFieldLabel(lineType),
    modelNo: (input.modelNo || "").trim(),
    category: (input.category || "").trim(),
    manufacturerName: (input.manufacturerName || "").trim(),
    supplierName: (input.supplierName || "").trim(),
    quantity: input.quantity != null ? String(input.quantity) : "",
    purchasePrice: toNullableNumber(input.purchase_price),
    salesPrice: toNullableNumber(input.sales_price),
    grossProfit: toNullableNumber(input.gross_profit),
    memo: (input.memo || "").trim(),
  };
}
