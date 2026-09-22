/**
 * 仕入価格 / 販売価格「複製して新規登録」の form 初期値（純関数）。
 * id / timestamps は含めない。新規行は常に is_active: true。
 */

import type { PriceTargetType } from "@/lib/prices/targetType";

export type PurchasePriceCopySource = {
  price_target_type: string | null;
  product_id: string | null;
  package_id: string | null;
  supplier_id: string | null;
  purchase_price: number | string | null;
  start_date: string | null;
  end_date: string | null;
  memo: string | null;
  is_active?: unknown;
};

export type PurchasePriceCopyFormValues = {
  price_target_type: PriceTargetType;
  product_id: string;
  package_id: string;
  supplier_id: string;
  purchase_price: string;
  start_date: string;
  end_date: string;
  memo: string;
  is_active: boolean;
};

export type SalesPriceCopySource = {
  dealer_id: string | null;
  price_target_type: string | null;
  product_id: string | null;
  package_id: string | null;
  sales_price: number | string | null;
  start_date: string | null;
  end_date: string | null;
  memo: string | null;
  is_active?: unknown;
};

export type SalesPriceCopyFormValues = {
  dealer_id: string;
  price_target_type: PriceTargetType;
  product_id: string;
  package_id: string;
  sales_price: string;
  start_date: string;
  end_date: string;
  memo: string;
  is_active: boolean;
};

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** 金額: null/空は ""。0 は "0" のまま（明示0円を潰さない） */
export function formatPriceCopyAmount(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function resolveTargetType(
  raw: string | null | undefined,
  productId: string,
  packageId: string
): PriceTargetType {
  const t = (raw || "").trim().toUpperCase();
  if (t === "PACKAGE") return "PACKAGE";
  if (t === "PRODUCT") return "PRODUCT";
  if (packageId && !productId) return "PACKAGE";
  return "PRODUCT";
}

export function buildPurchasePriceCopyFormValues(
  source: PurchasePriceCopySource
): PurchasePriceCopyFormValues {
  const productId = (source.product_id || "").trim();
  const packageId = (source.package_id || "").trim();
  const target = resolveTargetType(
    source.price_target_type,
    productId,
    packageId
  );
  return {
    price_target_type: target,
    product_id: target === "PRODUCT" ? productId : "",
    package_id: target === "PACKAGE" ? packageId : "",
    supplier_id: (source.supplier_id || "").trim(),
    purchase_price: formatPriceCopyAmount(source.purchase_price),
    start_date: asString(source.start_date),
    end_date: asString(source.end_date),
    memo: asString(source.memo),
    is_active: true,
  };
}

export function buildSalesPriceCopyFormValues(
  source: SalesPriceCopySource
): SalesPriceCopyFormValues {
  const productId = (source.product_id || "").trim();
  const packageId = (source.package_id || "").trim();
  const target = resolveTargetType(
    source.price_target_type,
    productId,
    packageId
  );
  return {
    dealer_id: (source.dealer_id || "").trim(),
    price_target_type: target,
    product_id: target === "PRODUCT" ? productId : "",
    package_id: target === "PACKAGE" ? packageId : "",
    sales_price: formatPriceCopyAmount(source.sales_price),
    start_date: asString(source.start_date),
    end_date: asString(source.end_date),
    memo: asString(source.memo),
    is_active: true,
  };
}

export const PURCHASE_PRICE_COPY_NOTICE =
  "元の仕入価格の内容を初期表示しています。適用開始日などを必要に応じて変更し、新規価格として保存してください。";

export const SALES_PRICE_COPY_NOTICE =
  "元の販売価格の内容を初期表示しています。適用開始日などを必要に応じて変更し、新規価格として保存してください。";
