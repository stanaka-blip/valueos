import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchActivePurchasePrice,
  getTodayDateString,
} from "@/lib/purchasePrices";
import type { PriceTargetType } from "@/lib/prices/targetType";
import { fetchActiveSalesPrice } from "@/lib/salesPrices";

export type MasterPriceHistoryRow = {
  id: string;
  partyId: string;
  partyName: string;
  amount: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

export type MasterCurrentPurchasePrice = {
  supplierId: string;
  supplierName: string;
  amount: number | null;
  startDate: string | null;
  endDate: string | null;
  priceId: string | null;
  found: boolean;
};

export type MasterCurrentSalesPrice = {
  dealerId: string;
  dealerName: string;
  amount: number;
  startDate: string | null;
  endDate: string | null;
  priceId: string;
};

export type MasterPricePanelsData = {
  asOfDate: string;
  currentPurchase: MasterCurrentPurchasePrice | null;
  currentSales: MasterCurrentSalesPrice[];
  purchaseHistory: MasterPriceHistoryRow[];
  salesHistory: MasterPriceHistoryRow[];
  error: string | null;
};

type LoadParams = {
  targetType: PriceTargetType;
  productId?: string | null;
  packageId?: string | null;
  defaultSupplierId?: string | null;
  defaultSupplierName?: string | null;
  asOfDate?: string;
};

function isActiveFlag(value: unknown): boolean {
  return value === true || value === "true";
}

function toAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function relationName(
  value: { name: string | null } | { name: string | null }[] | null | undefined
): string {
  if (!value) return "—";
  const row = Array.isArray(value) ? value[0] : value;
  return (row?.name || "").trim() || "—";
}

/** 履歴行から公式ルックアップ結果の日付を補完（N+1回避） */
export function findHistoryRowById(
  rows: MasterPriceHistoryRow[],
  priceId: string | null
): MasterPriceHistoryRow | null {
  if (!priceId) return null;
  return rows.find((r) => r.id === priceId) || null;
}

/**
 * 商品/パッケージ詳細用の価格パネルデータ。
 * 現行価格は必ず fetchActivePurchasePrice / fetchActiveSalesPrice を使用。
 * 履歴は対象IDに紐づく行を一括取得（start_date 降順）。
 */
export async function loadMasterPricePanels(
  client: SupabaseClient,
  params: LoadParams
): Promise<MasterPricePanelsData> {
  const asOfDate = params.asOfDate || getTodayDateString();
  const targetType = params.targetType;
  const productId = params.productId || null;
  const packageId = params.packageId || null;

  if (targetType === "PRODUCT" && !productId) {
    return emptyPanels(asOfDate, "商品IDがありません");
  }
  if (targetType === "PACKAGE" && !packageId) {
    return emptyPanels(asOfDate, "パッケージIDがありません");
  }

  let purchaseQuery = client
    .from("purchase_prices")
    .select(
      `
      id,
      supplier_id,
      purchase_price,
      start_date,
      end_date,
      is_active,
      suppliers ( name )
    `
    )
    .eq("price_target_type", targetType)
    .order("start_date", { ascending: false });

  let salesQuery = client
    .from("sales_prices")
    .select(
      `
      id,
      dealer_id,
      sales_price,
      start_date,
      end_date,
      is_active,
      dealers ( name )
    `
    )
    .eq("price_target_type", targetType)
    .order("start_date", { ascending: false });

  if (targetType === "PRODUCT") {
    purchaseQuery = purchaseQuery.eq("product_id", productId!);
    salesQuery = salesQuery.eq("product_id", productId!);
  } else {
    purchaseQuery = purchaseQuery.eq("package_id", packageId!);
    salesQuery = salesQuery.eq("package_id", packageId!);
  }

  const [purchaseRes, salesRes] = await Promise.all([
    purchaseQuery,
    salesQuery,
  ]);

  if (purchaseRes.error || salesRes.error) {
    return emptyPanels(
      asOfDate,
      purchaseRes.error?.message ||
        salesRes.error?.message ||
        "価格の取得に失敗しました"
    );
  }

  const purchaseHistory: MasterPriceHistoryRow[] = (purchaseRes.data || []).map(
    (row) => ({
      id: row.id as string,
      partyId: (row.supplier_id as string) || "",
      partyName: relationName(
        row.suppliers as
          | { name: string | null }
          | { name: string | null }[]
          | null
      ),
      amount: toAmount(row.purchase_price),
      startDate: (row.start_date as string | null) || null,
      endDate: (row.end_date as string | null) || null,
      isActive: isActiveFlag(row.is_active),
    })
  );

  const salesHistory: MasterPriceHistoryRow[] = (salesRes.data || []).map(
    (row) => ({
      id: row.id as string,
      partyId: (row.dealer_id as string) || "",
      partyName: relationName(
        row.dealers as
          | { name: string | null }
          | { name: string | null }[]
          | null
      ),
      amount: toAmount(row.sales_price),
      startDate: (row.start_date as string | null) || null,
      endDate: (row.end_date as string | null) || null,
      isActive: isActiveFlag(row.is_active),
    })
  );

  const defaultSupplierId = (params.defaultSupplierId || "").trim();
  let currentPurchase: MasterCurrentPurchasePrice | null = null;

  if (defaultSupplierId) {
    const active = await fetchActivePurchasePrice(client, {
      targetType,
      productId,
      packageId,
      supplierId: defaultSupplierId,
      asOfDate,
    });
    const historyRow = findHistoryRowById(purchaseHistory, active.priceId);
    const supplierName =
      (params.defaultSupplierName || "").trim() ||
      historyRow?.partyName ||
      "—";
    currentPurchase = {
      supplierId: defaultSupplierId,
      supplierName,
      amount: active.found ? active.unitPrice : null,
      startDate: historyRow?.startDate || null,
      endDate: historyRow?.endDate || null,
      priceId: active.priceId,
      found: active.found,
    };
  }

  const dealerIds = Array.from(
    new Set(salesHistory.map((r) => r.partyId).filter(Boolean))
  );

  const salesLookups = await Promise.all(
    dealerIds.map(async (dealerId) => {
      const active = await fetchActiveSalesPrice(client, {
        targetType,
        productId,
        packageId,
        dealerId,
        asOfDate,
      });
      return { dealerId, active };
    })
  );

  const currentSales: MasterCurrentSalesPrice[] = [];
  for (const { dealerId, active } of salesLookups) {
    if (!active.found || !active.priceId) continue;
    const historyRow = findHistoryRowById(salesHistory, active.priceId);
    currentSales.push({
      dealerId,
      dealerName: historyRow?.partyName || "—",
      amount: active.unitPrice,
      startDate: historyRow?.startDate || null,
      endDate: historyRow?.endDate || null,
      priceId: active.priceId,
    });
  }

  currentSales.sort((a, b) => a.dealerName.localeCompare(b.dealerName, "ja"));

  return {
    asOfDate,
    currentPurchase,
    currentSales,
    purchaseHistory,
    salesHistory,
    error: null,
  };
}

function emptyPanels(
  asOfDate: string,
  error: string | null
): MasterPricePanelsData {
  return {
    asOfDate,
    currentPurchase: null,
    currentSales: [],
    purchaseHistory: [],
    salesHistory: [],
    error,
  };
}
