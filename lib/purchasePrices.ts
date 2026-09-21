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
 * - start_date IS NULL OR start_date <= asOf
 * - end_date IS NULL OR end_date >= asOf
 * - 優先: 日付あり start_date 降順 → start_date NULL は fallback
 *
 * 単価 0 円は有効。レコード無し / 不正値のみ未設定。
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

/**
 * 明示された仕入単価を解釈する。
 * - null / undefined / "" / NaN / 負数 → 未設定 (null)
 * - 0 以上の有限数 → 有効（0円含む）
 */
export function parsePurchaseUnitPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

/**
 * 適用開始日の優先比較（小さいほど優先）。
 * 1. 日付ありを優先
 * 2. 同グループ内は start_date 降順（新しい方）
 * 3. start_date NULL は fallback
 */
export function comparePurchaseStartDatePriority(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const aDated = Boolean(a);
  const bDated = Boolean(b);
  if (aDated !== bDated) {
    return aDated ? -1 : 1;
  }
  if (aDated && bDated) {
    return String(b).localeCompare(String(a));
  }
  return 0;
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
  // start_date NULL は開始日未指定＝適用開始済みとして扱う（マスタ登録で省略される）
  if (row.start_date && row.start_date > asOfDate) return false;
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
 * 有効・期間内の行のうち、日付あり start_date 降順を優先し、NULL は fallback。
 * 単価 0 円は有効。レコード無し / 不正値のみ未設定 (null)。
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
      start_date: row.start_date,
      unitPrice: parsePurchaseUnitPrice(row.purchase_price),
    }))
    .filter(
      (row): row is { start_date: string | null; unitPrice: number } =>
        row.unitPrice != null
    )
    .sort((a, b) =>
      comparePurchaseStartDatePriority(a.start_date, b.start_date)
    );

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
    .select("id, purchase_price, start_date")
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .or(`start_date.is.null,start_date.lte.${asOfDate}`)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(50);

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

  const { data, error } = await query;
  if (error) {
    return { found: false, priceId: null, unitPrice: 0, error: error.message };
  }

  const ranked = [...(data || [])].sort((a, b) =>
    comparePurchaseStartDatePriority(
      a.start_date as string | null,
      b.start_date as string | null
    )
  );
  for (const row of ranked) {
    const unitPrice = parsePurchaseUnitPrice(row.purchase_price);
    if (unitPrice != null) {
      return {
        found: true,
        priceId: (row.id as string | undefined) || null,
        unitPrice,
        error: null,
      };
    }
  }

  return { found: false, priceId: null, unitPrice: 0, error: null };
}

/**
 * PACKAGE 構成品の仕入単価合計（同一仕入先の Map のみ渡す前提）。
 * PR #144 applySupplierMasterUnitPrices / caseProductCardPricing と同じ契約:
 * - 1品でも欠ければ null（部分合計禁止）
 * - 0円は有効
 * - 構成数量 × 単価を合算し Math.round
 */
export function sumPackageComponentPurchaseUnitPrices(
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
 * PACKAGE 仕入単価: PACKAGE マスタ優先 → 同一 supplier の構成 PRODUCT 合計 fallback。
 * 既存 fetchActivePurchasePrice / fetchActivePurchaseUnitPrices を再利用。
 */
export async function fetchActivePackagePurchaseUnitPriceWithFallback(
  client: SupabaseClient,
  params: {
    packageId: string;
    supplierId: string;
    asOfDate?: string;
  }
): Promise<ActivePurchasePriceLookupResult> {
  const { packageId, supplierId } = params;
  if (!packageId || !supplierId) {
    return { found: false, priceId: null, unitPrice: 0, error: null };
  }

  const packagePrice = await fetchActivePurchasePrice(client, {
    targetType: "PACKAGE",
    packageId,
    supplierId,
    asOfDate: params.asOfDate,
  });
  if (packagePrice.error) return packagePrice;
  if (packagePrice.found) return packagePrice;

  const { data: itemRows, error: itemsError } = await client
    .from("package_items")
    .select("product_id, quantity, is_hidden")
    .eq("package_id", packageId);

  if (itemsError) {
    return {
      found: false,
      priceId: null,
      unitPrice: 0,
      error: itemsError.message,
    };
  }

  const components: Array<{ productId: string; unitComponentQty: number }> = [];
  for (const row of itemRows || []) {
    if (row.is_hidden === true) continue;
    const productId = (row.product_id as string | null) || "";
    const qty = Number(row.quantity);
    if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
    components.push({ productId, unitComponentQty: qty });
  }

  if (components.length === 0) {
    return { found: false, priceId: null, unitPrice: 0, error: null };
  }

  const productIds = components.map((c) => c.productId);
  const batch = await fetchActivePurchaseUnitPrices(client, {
    productIds,
    supplierId,
    asOfDate: params.asOfDate,
  });
  if (batch.error) {
    return {
      found: false,
      priceId: null,
      unitPrice: 0,
      error: batch.error,
    };
  }

  const unit = sumPackageComponentPurchaseUnitPrices(
    components,
    batch.unitPriceByProductId
  );
  if (unit == null) {
    return { found: false, priceId: null, unitPrice: 0, error: null };
  }
  return { found: true, priceId: null, unitPrice: unit, error: null };
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
      .select("purchase_price, start_date")
      .eq("product_id", productId)
      .eq("supplier_id", supplierId)
      .eq("is_active", true)
      .or(`start_date.is.null,start_date.lte.${asOfDate}`)
      .or(`end_date.is.null,end_date.gte.${asOfDate}`)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      return { unitPrice: 0, found: false, error: error.message };
    }

    const ranked = [...(data || [])].sort((a, b) =>
      comparePurchaseStartDatePriority(
        a.start_date as string | null,
        b.start_date as string | null
      )
    );
    for (const row of ranked) {
      const unitPrice = parsePurchaseUnitPrice(row.purchase_price);
      if (unitPrice != null) {
        return { unitPrice, found: true, error: null };
      }
    }
    return { unitPrice: 0, found: false, error: null };
  }

  return {
    unitPrice: result.unitPrice,
    found: result.found,
    error: null,
  };
}

/**
 * 複数パッケージの有効仕入単価を一括取得（PACKAGE のみ）。
 */
export async function fetchActivePackagePurchaseUnitPrices(
  client: SupabaseClient,
  params: {
    packageIds: string[];
    supplierId: string;
    asOfDate?: string;
  }
): Promise<{
  unitPriceByPackageId: Map<string, number>;
  missingPackageIds: string[];
  error: string | null;
}> {
  const uniqueIds = Array.from(
    new Set(params.packageIds.filter((id) => Boolean(id)))
  );
  if (uniqueIds.length === 0 || !params.supplierId) {
    return {
      unitPriceByPackageId: new Map(),
      missingPackageIds: uniqueIds,
      error: null,
    };
  }

  const asOfDate = params.asOfDate || getTodayDateString();
  const { data, error } = await client
    .from("purchase_prices")
    .select("package_id, purchase_price, start_date")
    .in("package_id", uniqueIds)
    .eq("supplier_id", params.supplierId)
    .eq("price_target_type", "PACKAGE")
    .eq("is_active", true)
    .or(`start_date.is.null,start_date.lte.${asOfDate}`)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false, nullsFirst: false });

  if (error) {
    return {
      unitPriceByPackageId: new Map(),
      missingPackageIds: uniqueIds,
      error: error.message,
    };
  }

  const unitPriceByPackageId = new Map<string, number>();
  for (const row of data || []) {
    const packageId = row.package_id as string | null;
    if (!packageId || unitPriceByPackageId.has(packageId)) continue;
    const unitPrice = parsePurchaseUnitPrice(row.purchase_price);
    if (unitPrice != null) unitPriceByPackageId.set(packageId, unitPrice);
  }

  const missingPackageIds = uniqueIds.filter(
    (id) => !unitPriceByPackageId.has(id)
  );
  return { unitPriceByPackageId, missingPackageIds, error: null };
}

/**
 * 複数商品の有効仕入単価を一括取得（PRODUCT のみ）。
 * PACKAGE 向け価格行を誤って採用しないよう price_target_type を明示する。
 * 同一 product_id が複数行ある場合は日付あり start_date 降順を優先し、NULL は fallback。
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
    .or(`start_date.is.null,start_date.lte.${asOfDate}`)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false, nullsFirst: false });

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
      .or(`start_date.is.null,start_date.lte.${asOfDate}`)
      .or(`end_date.is.null,end_date.gte.${asOfDate}`)
      .order("start_date", { ascending: false, nullsFirst: false });
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
      // nullsLast + desc 済みのため、先勝ち = 日付あり最新 → NULL fallback
      continue;
    }
    const unitPrice = parsePurchaseUnitPrice(row.purchase_price);
    if (unitPrice != null) {
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
    .or(`start_date.is.null,start_date.lte.${asOfDate}`)
    .or(`end_date.is.null,end_date.gte.${asOfDate}`)
    .order("start_date", { ascending: false, nullsFirst: false });

  if (error) {
    return { unitPriceByTargetId: new Map(), error: error.message };
  }

  const candidates: ListPurchasePriceCandidate[] = (data || []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      targetId: (record[idColumn] as string | null) || "",
      supplierId: (record.supplier_id as string | null) || "",
      purchase_price: record.purchase_price,
      start_date: (record.start_date as string | null) || null,
      end_date: (record.end_date as string | null) || null,
      is_active: record.is_active,
    };
  });

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
