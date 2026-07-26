import type { SupabaseClient } from "@supabase/supabase-js";

import type { PriceTargetType } from "@/lib/prices/targetType";
import { getTodayDateString } from "@/lib/purchasePrices";

/**
 * 販売価格マスタ (sales_prices) の有効単価取得。
 *
 * RPC `create_case_registration` と同じ適用条件:
 * - dealer_id
 * - price_target_type = PRODUCT | PACKAGE
 * - product_id / package_id
 * - is_active = true
 * - start_date <= asOf
 * - end_date IS NULL OR end_date >= asOf
 * - 優先: start_date 降順の先頭1件
 *
 * 丸めルール（保存時）:
 * - 画面プレビューは単価を返す
 * - DB保存の合計は ROUND(unit * quantity)（PostgreSQL ROUND / 正の数では Math.round と同趣旨）
 */

export type SalesPriceLookupParams = {
  targetType: PriceTargetType;
  productId?: string | null;
  packageId?: string | null;
  dealerId: string;
  /** YYYY-MM-DD。省略時は本日。案件登録では order_received_date を渡す */
  asOfDate?: string;
};

export type ActivePriceLookupResult = {
  found: boolean;
  priceId: string | null;
  unitPrice: number;
  error: string | null;
};

function toUnitPrice(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 明細合計金額（円）。RPCの ROUND(unit * qty) に合わせる */
export function roundMoneyTotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity);
}

/** 有効な販売単価を1件取得（マスタID付き） */
export async function fetchActiveSalesPrice(
  client: SupabaseClient,
  params: SalesPriceLookupParams
): Promise<ActivePriceLookupResult> {
  const { targetType, dealerId } = params;
  if (!dealerId) {
    return { found: false, priceId: null, unitPrice: 0, error: null };
  }

  const asOfDate = params.asOfDate || getTodayDateString();
  let query = client
    .from("sales_prices")
    .select("id, sales_price")
    .eq("dealer_id", dealerId)
    .eq("is_active", true)
    .lte("start_date", asOfDate)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false })
    .limit(1);

  if (targetType === "PRODUCT") {
    if (!params.productId) {
      return { found: false, priceId: null, unitPrice: 0, error: null };
    }
    query = query
      .eq("price_target_type", "PRODUCT")
      .eq("product_id", params.productId);
  } else {
    if (!params.packageId) {
      return { found: false, priceId: null, unitPrice: 0, error: null };
    }
    query = query
      .eq("price_target_type", "PACKAGE")
      .eq("package_id", params.packageId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return { found: false, priceId: null, unitPrice: 0, error: error.message };
  }

  const unitPrice = toUnitPrice(data?.sales_price);
  return {
    found: unitPrice > 0,
    priceId: (data?.id as string | undefined) || null,
    unitPrice,
    error: null,
  };
}
