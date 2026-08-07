/**
 * Phase A: 請求登録画面向け請求金額オートフィル（マスタ価格ベース）。
 * case_products.sales_price スナップショットは使わない（将来 Phase B）。
 */

import type { PriceTargetType } from "@/lib/prices/targetType";
import { roundMoneyTotal } from "@/lib/salesPrices";

import { calculateInvoiceAmountInclusive } from "./invoiceTax";

export type InvoiceLinePriceStatus = "priced" | "unset" | "error";

export type InvoiceLineForAutofill = {
  id: string;
  lineType: PriceTargetType;
  productId: string | null;
  packageId: string | null;
  quantity: number;
  /** 表示用ラベル */
  label: string;
};

export type ResolvedInvoiceLinePrice = InvoiceLineForAutofill & {
  status: InvoiceLinePriceStatus;
  unitPriceExTax: number | null;
  lineTotalExTax: number | null;
  errorMessage: string | null;
};

export type InvoiceAmountAutofillResult = {
  lines: ResolvedInvoiceLinePrice[];
  /** 価格取得できた明細の税抜合計（未設定は含めない） */
  subtotalExTax: number;
  tax: number;
  /** 税込。価格付き明細が1件も無い場合は null（初期値を入れない） */
  invoiceAmountInclusive: number | null;
  hasUnsetPrices: boolean;
  unsetCount: number;
  pricedCount: number;
};

export const UNSET_PRICE_WARNING =
  "販売価格未設定の商品があります。請求金額を確認してください。";

export const UNSET_PRICE_LABEL = "販売価格未設定";

/** 解決済み明細から請求書単位で税込初期値を組み立てる */
export function buildInvoiceAmountAutofill(
  resolvedLines: ResolvedInvoiceLinePrice[]
): InvoiceAmountAutofillResult {
  let subtotalExTax = 0;
  let unsetCount = 0;
  let pricedCount = 0;

  for (const line of resolvedLines) {
    if (line.status === "priced" && line.lineTotalExTax != null) {
      subtotalExTax += line.lineTotalExTax;
      pricedCount += 1;
      continue;
    }
    if (line.status === "unset" || line.status === "error") {
      unsetCount += 1;
    }
  }

  const hasUnsetPrices = unsetCount > 0;
  if (pricedCount === 0) {
    return {
      lines: resolvedLines,
      subtotalExTax: 0,
      tax: 0,
      invoiceAmountInclusive: null,
      hasUnsetPrices,
      unsetCount,
      pricedCount,
    };
  }

  const breakdown = calculateInvoiceAmountInclusive(subtotalExTax);
  return {
    lines: resolvedLines,
    subtotalExTax: breakdown.subtotalExTax,
    tax: breakdown.tax,
    invoiceAmountInclusive: breakdown.invoiceAmountInclusive,
    hasUnsetPrices,
    unsetCount,
    pricedCount,
  };
}

/** 税抜単価と数量から line total（税抜）を作る。単価未設定は null */
export function lineTotalExTaxFromUnit(
  unitPriceExTax: number | null | undefined,
  quantity: number
): number | null {
  if (
    unitPriceExTax == null ||
    !Number.isFinite(unitPriceExTax) ||
    unitPriceExTax <= 0
  ) {
    return null;
  }
  const qty =
    Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (qty <= 0) return null;
  return roundMoneyTotal(unitPriceExTax, qty);
}

export function resolveLineFromLookup(input: {
  line: InvoiceLineForAutofill;
  found: boolean;
  unitPrice: number;
  lookupError: string | null;
}): ResolvedInvoiceLinePrice {
  const { line, found, unitPrice, lookupError } = input;

  if (lookupError) {
    return {
      ...line,
      status: "error",
      unitPriceExTax: null,
      lineTotalExTax: null,
      errorMessage: lookupError,
    };
  }

  if (!found || unitPrice <= 0) {
    return {
      ...line,
      status: "unset",
      unitPriceExTax: null,
      lineTotalExTax: null,
      errorMessage: null,
    };
  }

  const lineTotalExTax = lineTotalExTaxFromUnit(unitPrice, line.quantity);
  if (lineTotalExTax == null) {
    return {
      ...line,
      status: "unset",
      unitPriceExTax: null,
      lineTotalExTax: null,
      errorMessage: null,
    };
  }

  return {
    ...line,
    status: "priced",
    unitPriceExTax: unitPrice,
    lineTotalExTax,
    errorMessage: null,
  };
}
