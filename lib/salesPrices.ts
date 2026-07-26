import type { SupabaseClient } from "@supabase/supabase-js";

import type { PriceTargetType } from "@/lib/prices/targetType";
import { getTodayDateString } from "@/lib/purchasePrices";

/**
 * 販売価格マスタ (sales_prices) の有効単価取得。
 *
 * - dealer_id
 * - PRODUCT: product_id / PACKAGE: package_id
 * - is_active = true
 * - start_date <= 基準日
 * - end_date IS NULL OR end_date >= 基準日
 * - 優先: start_date 降順の先頭1件
 */

export type SalesPriceLookupParams = {
  targetType: PriceTargetType;
  productId?: string | null;
  packageId?: string | null;
  dealerId: string;
  /** YYYY-MM-DD。省略時は本日 */
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
    // price_target_type 未適用環境向けフォールバック（PRODUCT のみ）
    if (
      targetType === "PRODUCT" &&
      params.productId &&
      /price_target_type|column .* does not exist/i.test(error.message)
    ) {
      const fallback = await client
        .from("sales_prices")
        .select("id, sales_price")
        .eq("dealer_id", dealerId)
        .eq("product_id", params.productId)
        .eq("is_active", true)
        .lte("start_date", asOfDate)
        .or(`end_date.is.null,end_date.gte.${asOfDate}`)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallback.error) {
        return {
          found: false,
          priceId: null,
          unitPrice: 0,
          error: fallback.error.message,
        };
      }

      const unitPrice = toUnitPrice(fallback.data?.sales_price);
      return {
        found: unitPrice > 0,
        priceId: (fallback.data?.id as string | undefined) || null,
        unitPrice,
        error: null,
      };
    }

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
