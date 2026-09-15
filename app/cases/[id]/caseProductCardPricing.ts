/**
 * 案件詳細・商品カードの仕入先/価格表示解決（表示専用・純関数）。
 *
 * 優先順位（仕入金額）:
 * 1. case_products スナップショット（保存済み金額）
 * 2. 有効な発注明細の合計金額（確定寄り）
 * 3. PR #144 と同じ仕入単価マスタ解決結果 × 数量（参考表示）
 *
 * マスタ変更で過去の確定金額が変わって見えないよう、
 * 1・2 がある場合はマスタで上書きしない。
 */

import { roundMoneyTotal } from "@/lib/salesPrices";

export type CaseProductCardPriceSource =
  | "case_snapshot"
  | "order"
  | "master"
  | "none";

export type CaseProductCardPricingInput = {
  quantity: number | null;
  caseSupplierId: string | null;
  caseSupplierName: string;
  /** case_products.purchase_price（明細金額スナップショット） */
  casePurchasePrice: number | null;
  /** case_products.sales_price（明細金額スナップショット） */
  caseSalesPrice: number | null;
  caseGrossProfit: number | null;
  defaultSupplierId: string | null;
  defaultSupplierName: string;
  /** 有効発注の order_items.amount 合計（case_product_id 紐付け） */
  orderedPurchaseAmount: number | null;
  orderedSupplierId: string | null;
  orderedSupplierName: string;
  /** 解決済み仕入先に対するマスタ仕入単価（0円は有効） */
  masterPurchaseUnitPrice: number | null;
  /** 販売店に対するマスタ販売単価 */
  masterSalesUnitPrice: number | null;
};

export type CaseProductCardPricingResult = {
  supplierId: string | null;
  supplierName: string;
  /** 明細の仕入金額（単価ではない） */
  purchasePrice: number | null;
  /** 明細の販売金額 */
  salesPrice: number | null;
  grossProfit: number | null;
  purchaseSource: CaseProductCardPriceSource;
  salesSource: CaseProductCardPriceSource;
};

export function parseCaseProductQuantity(
  value: number | string | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function resolveCaseProductSupplier(input: {
  caseSupplierId: string | null;
  caseSupplierName: string;
  orderedSupplierId: string | null;
  orderedSupplierName: string;
  defaultSupplierId: string | null;
  defaultSupplierName: string;
}): { supplierId: string | null; supplierName: string } {
  if (input.caseSupplierId) {
    return {
      supplierId: input.caseSupplierId,
      supplierName: (input.caseSupplierName || "").trim(),
    };
  }
  if (input.orderedSupplierId) {
    return {
      supplierId: input.orderedSupplierId,
      supplierName: (input.orderedSupplierName || "").trim(),
    };
  }
  if (input.defaultSupplierId) {
    return {
      supplierId: input.defaultSupplierId,
      supplierName: (input.defaultSupplierName || "").trim(),
    };
  }
  return { supplierId: null, supplierName: "" };
}

/**
 * PACKAGE 構成品単価合計（同一仕入先のみ）。
 * applySupplierMasterUnitPrices と同じ契約:
 * - 1品でも欠ければ null
 * - 0円は有効
 * - 別仕入先の単価は渡さない前提
 */
export function sumPackageComponentPurchaseUnit(
  components: Array<{ productId: string; unitComponentQty: number }>,
  unitPriceByProductId: Map<string, number>
): number | null {
  if (components.length === 0) return null;
  let sum = 0;
  for (const component of components) {
    if (!component.productId || !(component.unitComponentQty > 0)) {
      return null;
    }
    const unit = unitPriceByProductId.get(component.productId);
    if (unit == null) return null;
    sum += unit * component.unitComponentQty;
  }
  return Math.round(sum);
}

/**
 * 仕入金額の情報源と仕入先表示を揃える。
 * 発注金額を出しているときは有効発注の仕入先を優先（複数仕入先表示を含む）。
 */
export function resolveSupplierForPurchaseSource(
  purchaseSource: CaseProductCardPriceSource,
  input: Pick<
    CaseProductCardPricingInput,
    | "caseSupplierId"
    | "caseSupplierName"
    | "orderedSupplierId"
    | "orderedSupplierName"
    | "defaultSupplierId"
    | "defaultSupplierName"
  >
): { supplierId: string | null; supplierName: string } {
  if (purchaseSource === "order") {
    return {
      supplierId: input.orderedSupplierId,
      supplierName: (input.orderedSupplierName || "").trim(),
    };
  }
  return resolveCaseProductSupplier(input);
}

export function resolveCaseProductCardPricing(
  input: CaseProductCardPricingInput
): CaseProductCardPricingResult {
  const qty = input.quantity;

  let purchasePrice: number | null = null;
  let purchaseSource: CaseProductCardPriceSource = "none";

  if (input.casePurchasePrice != null) {
    purchasePrice = input.casePurchasePrice;
    purchaseSource = "case_snapshot";
  } else if (input.orderedPurchaseAmount != null) {
    purchasePrice = input.orderedPurchaseAmount;
    purchaseSource = "order";
  } else if (input.masterPurchaseUnitPrice != null && qty != null) {
    purchasePrice = roundMoneyTotal(input.masterPurchaseUnitPrice, qty);
    purchaseSource = "master";
  }

  const supplier = resolveSupplierForPurchaseSource(purchaseSource, input);

  let salesPrice: number | null = null;
  let salesSource: CaseProductCardPriceSource = "none";

  if (input.caseSalesPrice != null) {
    salesPrice = input.caseSalesPrice;
    salesSource = "case_snapshot";
  } else if (input.masterSalesUnitPrice != null && qty != null) {
    salesPrice = roundMoneyTotal(input.masterSalesUnitPrice, qty);
    salesSource = "master";
  }

  let grossProfit: number | null = null;
  if (salesPrice != null && purchasePrice != null) {
    // カード上の参考粗利。確定粗利タブ（請求・発注ベース）とは別。
    grossProfit = salesPrice - purchasePrice;
  } else if (
    input.caseGrossProfit != null &&
    input.caseSalesPrice != null &&
    input.casePurchasePrice != null
  ) {
    grossProfit = input.caseGrossProfit;
  }

  return {
    supplierId: supplier.supplierId,
    supplierName: supplier.supplierName,
    purchasePrice,
    salesPrice,
    grossProfit,
    purchaseSource,
    salesSource,
  };
}
