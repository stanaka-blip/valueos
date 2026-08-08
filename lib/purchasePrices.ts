import type { SupabaseClient } from "@supabase/supabase-js";

import type { PriceTargetType } from "@/lib/prices/targetType";

/**
 * 仕入価格マスタ (purchase_prices) の有効単価取得。
 *
 * RPC `create_case_registration` と同じ適用条件:
 * - supplier_id
 * - price_target_type = PRODUCT | PACKAGE
 * - product_id / package_id
 * - is_active = true
 * - start_date <= asOf
 * - end_date IS NULL OR end_date >= asOf
 * - 優先: start_date 降順の先頭1件
 *
 * ※ purchase_prices に dealer_id 列はない。
 * 丸め: 保存合計は ROUND(unit * quantity)。プレビューは単価を返す。
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

export type PurchasePriceTargetLookupParams = {
  targetType: PriceTargetType;
  productId?: string | null;
  packageId?: string | null;
  supplierId: string;
  /** YYYY-MM-DD。省略時は本日。案件登録では order_received_date を渡す */
  asOfDate?: string;
};

export type ActivePurchasePriceLookupResult = {
  found: boolean;
  priceId: string | null;
  unitPrice: number;
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

export function isActivePurchaseFlag(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * fetchActivePurchasePrice と同じ適用期間・有効フラグ判定。
 * 一覧バッチ用の純関数（独自ルールを作らない）。
 */
export function matchesActivePurchaseWindow(
  row: {
    start_date: string | null | undefined;
    end_date: string | null | undefined;
    is_active: unknown;
  },
  asOfDate: string
): boolean {
  if (!isActivePurchaseFlag(row.is_active)) return false;
  if (!row.start_date || row.start_date > asOfDate) return false;
  if (row.end_date && row.end_date < asOfDate) return false;
  return true;
}

export type ListPurchasePriceCandidate = {
  targetId: string;
  supplierId: string;
  purchase_price: unknown;
  start_date: string | null;
  end_date: string | null;
  is_active: unknown;
};

/**
 * 候補行から対象×仕入先の現行仕入単価を選ぶ。
 * 条件は fetchActivePurchasePrice と同じ（有効・期間内・start_date DESC・金額>0）。
 */
export function pickActivePurchaseUnitForTarget(
  candidates: ListPurchasePriceCandidate[],
  targetId: string,
  supplierId: string,
  asOfDate: string
): number | null {
  if (!targetId || !supplierId) return null;

  const eligible = candidates
    .filter(
      (row) => row.targetId === targetId && row.supplierId === supplierId
    )
    .filter((row) => matchesActivePurchaseWindow(row, asOfDate))
    .map((row) => ({
      start_date: row.start_date || "",
      unitPrice: toUnitPrice(row.purchase_price),
    }))
    .filter((row) => row.unitPrice > 0)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return eligible[0]?.unitPrice ?? null;
}

/** 有効な仕入単価を1件取得（PRODUCT / PACKAGE、マスタID付き） */
export async function fetchActivePurchasePrice(
  client: SupabaseClient,
  params: PurchasePriceTargetLookupParams
): Promise<ActivePurchasePriceLookupResult> {
  const { targetType, supplierId } = params;
  if (!supplierId) {
    return { found: false, priceId: null, unitPrice: 0, error: null };
  }

  const asOfDate = params.asOfDate || getTodayDateString();
  let query = client
    .from("purchase_prices")
    .select("id, purchase_price")
    .eq("supplier_id", supplierId)
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

  const unitPrice = toUnitPrice(data?.purchase_price);
  return {
    found: unitPrice > 0,
    priceId: (data?.id as string | undefined) || null,
    unitPrice,
    error: null,
  };
}

/** 単一商品の有効仕入単価を取得（既存互換・PRODUCT） */
export async function fetchActivePurchaseUnitPrice(
  client: SupabaseClient,
  params: PurchasePriceLookupParams
): Promise<PurchasePriceLookupResult> {
  const result = await fetchActivePurchasePrice(client, {
    targetType: "PRODUCT",
    productId: params.productId,
    supplierId: params.supplierId,
    asOfDate: params.asOfDate,
  });

  if (result.error) {
    // price_target_type 未適用環境向けフォールバック
    const { productId, supplierId } = params;
    if (!productId || !supplierId) {
      return { unitPrice: 0, found: false, error: result.error };
    }
    if (!/price_target_type|column .* does not exist/i.test(result.error)) {
      return { unitPrice: 0, found: false, error: result.error };
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
    return { unitPrice, found: unitPrice > 0, error: null };
  }

  return {
    unitPrice: result.unitPrice,
    found: result.found,
    error: null,
  };
}

/**
 * 複数商品の有効仕入単価を一括取得（PRODUCT のみ）。
 * PACKAGE 向け価格行を誤って採用しないよう price_target_type を明示する。
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

  const withTargetType = await client
    .from("purchase_prices")
    .select("product_id, purchase_price, start_date")
    .in("product_id", uniqueIds)
    .eq("supplier_id", params.supplierId)
    .eq("price_target_type", "PRODUCT")
    .eq("is_active", true)
    .lte("start_date", asOfDate)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false });

  let data = withTargetType.data;
  let error = withTargetType.error;

  // price_target_type 未適用環境向けフォールバック（単件取得と同様）
  if (
    error &&
    /price_target_type|column .* does not exist/i.test(error.message)
  ) {
    const legacy = await client
      .from("purchase_prices")
      .select("product_id, purchase_price, start_date")
      .in("product_id", uniqueIds)
      .eq("supplier_id", params.supplierId)
      .eq("is_active", true)
      .lte("start_date", asOfDate)
      .or(`end_date.is.null,end_date.gte.${asOfDate}`)
      .order("start_date", { ascending: false });
    data = legacy.data;
    error = legacy.error;
  }

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

/**
 * 一覧用: 複数対象の現行仕入単価を一括取得。
 * - N+1 を避け、対象IDをまとめて取得（仕入先ごとに分割しない）
 * - 判定は fetchActivePurchasePrice と同じ条件
 * - supplierByTargetId に無い / 空の対象は結果に載せない（画面では —）
 */
export async function fetchListCurrentPurchaseUnitPrices(
  client: SupabaseClient,
  params: {
    targetType: PriceTargetType;
    /** targetId → default_supplier_id */
    supplierByTargetId: Map<string, string>;
    asOfDate?: string;
  }
): Promise<{
  unitPriceByTargetId: Map<string, number>;
  error: string | null;
}> {
  const asOfDate = params.asOfDate || getTodayDateString();
  const targetIds = Array.from(params.supplierByTargetId.keys()).filter(
    (id) => Boolean(id) && Boolean(params.supplierByTargetId.get(id))
  );

  if (targetIds.length === 0) {
    return { unitPriceByTargetId: new Map(), error: null };
  }

  const idColumn =
    params.targetType === "PRODUCT" ? "product_id" : "package_id";

  const { data, error } = await client
    .from("purchase_prices")
    .select(
      `${idColumn}, supplier_id, purchase_price, start_date, end_date, is_active`
    )
    .eq("price_target_type", params.targetType)
    .in(idColumn, targetIds)
    .eq("is_active", true)
    .lte("start_date", asOfDate)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false });

  if (error) {
    return { unitPriceByTargetId: new Map(), error: error.message };
  }

  const candidates: ListPurchasePriceCandidate[] = (data || []).map((row) => ({
    targetId: (row[idColumn] as string | null) || "",
    supplierId: (row.supplier_id as string | null) || "",
    purchase_price: row.purchase_price,
    start_date: (row.start_date as string | null) || null,
    end_date: (row.end_date as string | null) || null,
    is_active: row.is_active,
  }));

  const unitPriceByTargetId = new Map<string, number>();
  for (const targetId of targetIds) {
    const supplierId = params.supplierByTargetId.get(targetId) || "";
    const unit = pickActivePurchaseUnitForTarget(
      candidates,
      targetId,
      supplierId,
      asOfDate
    );
    if (unit != null) {
      unitPriceByTargetId.set(targetId, unit);
    }
  }

  return { unitPriceByTargetId, error: null };
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
