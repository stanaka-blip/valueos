/**
 * 案件登録 STEP2: 仕入先変更時の仕入単価再解決（純関数 + 非同期 I/O 境界）。
 * PR #144 purchase resolver 契約に合わせる。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchActivePackagePurchaseUnitPriceWithFallback,
  fetchActivePurchasePrice,
  parsePurchaseUnitPrice,
} from "@/lib/purchasePrices";
import { fetchActiveSalesPrice } from "@/lib/salesPrices";

import type { LineType } from "./types";

export type LinePriceFields = {
  purchase_price: string;
  sales_price: string;
  /** ユーザーが仕入単価を手入力したか（再resolveで上書きしない） */
  purchase_price_is_manual: boolean;
  purchase_price_unset: boolean;
  sales_price_unset: boolean;
};

export function emptyLinePriceFields(): LinePriceFields {
  return {
    purchase_price: "",
    sales_price: "",
    purchase_price_is_manual: false,
    purchase_price_unset: false,
    sales_price_unset: false,
  };
}

export function formatYenInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

/**
 * 仕入先変更時: 手動フラグが立っていなければ仕入単価をクリアして再取得対象にする。
 * 販売単価は販売店×商品のため仕入先変更では維持（別途 dealer 変更で再取得）。
 */
export function patchOnSupplierChange(params: {
  purchase_price_is_manual: boolean;
  purchase_price: string;
}): Pick<
  LinePriceFields,
  "purchase_price" | "purchase_price_is_manual" | "purchase_price_unset"
> {
  if (params.purchase_price_is_manual) {
    return {
      purchase_price: params.purchase_price,
      purchase_price_is_manual: true,
      purchase_price_unset: false,
    };
  }
  return {
    purchase_price: "",
    purchase_price_is_manual: false,
    purchase_price_unset: false,
  };
}

async function resolvePurchaseUnitPrice(params: {
  client: SupabaseClient;
  lineType: LineType;
  productId: string;
  packageId: string;
  supplierId: string;
  asOfDate: string;
}): Promise<{ found: boolean; unitPrice: number }> {
  const { client, lineType, productId, packageId, supplierId, asOfDate } =
    params;
  if (!supplierId) return { found: false, unitPrice: 0 };

  if (lineType === "PACKAGE") {
    if (!packageId) return { found: false, unitPrice: 0 };
    const purchase = await fetchActivePackagePurchaseUnitPriceWithFallback(
      client,
      {
        packageId,
        supplierId,
        asOfDate: asOfDate || undefined,
      }
    );
    return { found: purchase.found, unitPrice: purchase.unitPrice };
  }

  if (!productId) return { found: false, unitPrice: 0 };
  const purchase = await fetchActivePurchasePrice(client, {
    targetType: "PRODUCT",
    productId,
    supplierId,
    asOfDate: asOfDate || undefined,
  });
  return { found: purchase.found, unitPrice: purchase.unitPrice };
}

export async function resolveLinePrices(params: {
  client: SupabaseClient;
  lineType: LineType;
  productId: string;
  packageId: string;
  supplierId: string;
  dealerId: string;
  asOfDate: string;
  /** true のとき仕入は再取得しない */
  keepManualPurchase: boolean;
  currentPurchasePrice: string;
}): Promise<LinePriceFields> {
  const {
    client,
    lineType,
    productId,
    packageId,
    supplierId,
    dealerId,
    asOfDate,
    keepManualPurchase,
    currentPurchasePrice,
  } = params;

  let purchase_price = "";
  let purchase_price_unset = false;
  let purchase_price_is_manual = keepManualPurchase;

  if (keepManualPurchase) {
    purchase_price = currentPurchasePrice;
    purchase_price_unset = false;
  } else if (supplierId) {
    const purchase = await resolvePurchaseUnitPrice({
      client,
      lineType,
      productId,
      packageId,
      supplierId,
      asOfDate,
    });
    if (purchase.found) {
      purchase_price = formatYenInput(purchase.unitPrice);
      purchase_price_unset = false;
    } else {
      purchase_price = "";
      purchase_price_unset = true;
    }
  } else {
    purchase_price_unset = true;
  }

  let sales_price = "";
  let sales_price_unset = false;
  if (dealerId && (productId || packageId)) {
    const sales = await fetchActiveSalesPrice(client, {
      targetType: lineType,
      productId: lineType === "PRODUCT" ? productId : null,
      packageId: lineType === "PACKAGE" ? packageId : null,
      dealerId,
      asOfDate: asOfDate || undefined,
    });
    if (sales.found && sales.unitPrice > 0) {
      sales_price = formatYenInput(sales.unitPrice);
      sales_price_unset = false;
    } else {
      sales_price = "";
      sales_price_unset = true;
    }
  } else {
    sales_price_unset = true;
  }

  return {
    purchase_price,
    sales_price,
    purchase_price_is_manual,
    purchase_price_unset,
    sales_price_unset,
  };
}

/** gateway / RPC 向け数値化。空は null。0 は有効。負は invalid。 */
export function parseOptionalNonNegativePrice(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const t = (raw || "").trim();
  if (t === "") return { ok: true, value: null };
  const n = parsePurchaseUnitPrice(t);
  if (n == null) return { ok: false };
  return { ok: true, value: n };
}
