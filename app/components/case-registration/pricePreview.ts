import { fetchActivePurchasePrice } from "@/lib/purchasePrices";
import { fetchActiveSalesPrice } from "@/lib/salesPrices";
import { supabase } from "@/lib/supabase";
import type { LineDraft } from "./types";

/** 1明細の販売・仕入単価を再取得（表示用。保存時はサーバが再取得） */
export async function refreshLinePrices(options: {
  line: LineDraft;
  dealerId: string;
  asOfDate: string;
}): Promise<LineDraft> {
  const { line, dealerId, asOfDate } = options;
  const base: LineDraft = {
    ...line,
    price_loading: true,
    price_error: null,
  };

  if (!dealerId || !asOfDate || !line.supplier_id) {
    return {
      ...base,
      price_loading: false,
      sales_unit_price: null,
      purchase_unit_price: null,
      sales_found: false,
      purchase_found: false,
      price_error: !dealerId
        ? "販売店を選択してください"
        : !line.supplier_id
          ? "標準仕入先が設定されていません"
          : "受注日を入力してください",
    };
  }

  if (line.line_type === "PRODUCT" && !line.product_id) {
    return {
      ...base,
      price_loading: false,
      sales_unit_price: null,
      purchase_unit_price: null,
      sales_found: false,
      purchase_found: false,
      price_error: null,
    };
  }
  if (line.line_type === "PACKAGE" && !line.package_id) {
    return {
      ...base,
      price_loading: false,
      sales_unit_price: null,
      purchase_unit_price: null,
      sales_found: false,
      purchase_found: false,
      price_error: null,
    };
  }

  const [sales, purchase] = await Promise.all([
    fetchActiveSalesPrice(supabase, {
      targetType: line.line_type,
      productId: line.line_type === "PRODUCT" ? line.product_id : null,
      packageId: line.line_type === "PACKAGE" ? line.package_id : null,
      dealerId,
      asOfDate,
    }),
    fetchActivePurchasePrice(supabase, {
      targetType: line.line_type,
      productId: line.line_type === "PRODUCT" ? line.product_id : null,
      packageId: line.line_type === "PACKAGE" ? line.package_id : null,
      supplierId: line.supplier_id,
      asOfDate,
    }),
  ]);

  let price_error: string | null = null;
  if (sales.error || purchase.error) {
    price_error = "価格の取得に失敗しました";
  } else if (!sales.found) {
    price_error = "販売単価が見つかりません";
  } else if (!purchase.found) {
    price_error = "仕入単価が見つかりません";
  }

  return {
    ...line,
    price_loading: false,
    sales_unit_price: sales.found ? sales.unitPrice : null,
    purchase_unit_price: purchase.found ? purchase.unitPrice : null,
    sales_found: sales.found,
    purchase_found: purchase.found,
    price_error,
  };
}
