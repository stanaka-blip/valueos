import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 仕入価格マスタ (purchase_prices) の有効単価取得。
 *
 * 既存 /cases/[id]/products/new と同じ条件:
 * - product_id
 * - supplier_id（仕入先）
 * - is_active = true
 * - start_date <= 基準日
 * - end_date IS NULL OR end_date >= 基準日
 * - 優先: start_date 降順の先頭1件
 *
 * ※ purchase_prices に dealer_id 列はないため、販売店は仕入先解決にのみ使う。
 */

export type PurchasePriceLookupParams = {
  productId: string;
  supplierId: string;
  /** YYYY-MM-DD。省略時は本日 */
  asOfDate?: string;
};

export type PurchasePriceLookupResult = {
  unitPrice: number;
  found: boolean;
  error: string | null;
};

export type PurchasePriceBatchResult = {
  /** product_id → 仕入単価（見つからない場合は載せない） */
  unitPriceByProductId: Map<string, number>;
  missingProductIds: string[];
  error: string | null;
};

export function getTodayDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUnitPrice(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 単一商品の有効仕入単価を取得 */
export async function fetchActivePurchaseUnitPrice(
  client: SupabaseClient,
  params: PurchasePriceLookupParams
): Promise<PurchasePriceLookupResult> {
  const { productId, supplierId } = params;
  if (!productId || !supplierId) {
    return { unitPrice: 0, found: false, error: null };
  }

  const asOfDate = params.asOfDate || getTodayDateString();

  const { data, error } = await client
    .from("purchase_prices")
    .select("purchase_price")
    .eq("product_id", productId)
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .lte("start_date", asOfDate)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { unitPrice: 0, found: false, error: error.message };
  }

  const unitPrice = toUnitPrice(data?.purchase_price);
  return {
    unitPrice,
    found: unitPrice > 0,
    error: null,
  };
}

/**
 * 複数商品の有効仕入単価を一括取得。
 * 同一 product_id が複数行ある場合は start_date 降順で先頭を採用。
 */
export async function fetchActivePurchaseUnitPrices(
  client: SupabaseClient,
  params: {
    productIds: string[];
    supplierId: string;
    asOfDate?: string;
  }
): Promise<PurchasePriceBatchResult> {
  const uniqueIds = Array.from(
    new Set(params.productIds.filter((id) => Boolean(id)))
  );

  if (uniqueIds.length === 0 || !params.supplierId) {
    return {
      unitPriceByProductId: new Map(),
      missingProductIds: uniqueIds,
      error: null,
    };
  }

  const asOfDate = params.asOfDate || getTodayDateString();

  const { data, error } = await client
    .from("purchase_prices")
    .select("product_id, purchase_price, start_date")
    .in("product_id", uniqueIds)
    .eq("supplier_id", params.supplierId)
    .eq("is_active", true)
    .lte("start_date", asOfDate)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false });

  if (error) {
    return {
      unitPriceByProductId: new Map(),
      missingProductIds: uniqueIds,
      error: error.message,
    };
  }

  const unitPriceByProductId = new Map<string, number>();
  for (const row of data || []) {
    const productId = row.product_id as string | null;
    if (!productId || unitPriceByProductId.has(productId)) {
      // start_date desc 済みのため、先勝ち = 最新適用開始日
      continue;
    }
    const unitPrice = toUnitPrice(row.purchase_price);
    if (unitPrice > 0) {
      unitPriceByProductId.set(productId, unitPrice);
    }
  }

  const missingProductIds = uniqueIds.filter(
    (id) => !unitPriceByProductId.has(id)
  );

  return {
    unitPriceByProductId,
    missingProductIds,
    error: null,
  };
}

/** 販売店の default_supplier_id を取得 */
export async function resolveDealerDefaultSupplierId(
  client: SupabaseClient,
  dealerId: string
): Promise<string | null> {
  if (!dealerId) {
    return null;
  }

  const { data, error } = await client
    .from("dealers")
    .select("default_supplier_id")
    .eq("id", dealerId)
    .maybeSingle();

  if (error) {
    console.warn(
      "[purchasePrices] default_supplier_id 取得失敗:",
      error.message
    );
    return null;
  }

  return (data?.default_supplier_id as string | null) || null;
}
