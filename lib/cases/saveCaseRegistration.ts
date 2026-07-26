import type { SupabaseClient } from "@supabase/supabase-js";

import type { PriceTargetType } from "@/lib/prices/targetType";
import { fetchActivePurchaseUnitPrices } from "@/lib/purchasePrices";

export type CaseRegistrationLineInput = {
  lineType: PriceTargetType;
  productId: string | null;
  packageId: string | null;
  supplierId: string | null;
  quantity: number;
  /** 単価（マスタ取得 or 手動） */
  unitSalesPrice: number;
  unitPurchasePrice: number;
  salesPriceId: string | null;
  purchasePriceId: string | null;
  isManualPrice: boolean;
  memo: string | null;
  /** 表示用（cases.product_name サマリ） */
  displayName: string;
};

export type CaseRegistrationInput = {
  caseNo: string;
  dealerId: string;
  customerName: string;
  customerPhone: string | null;
  siteAddress: string | null;
  orderType: string;
  orderReceivedDate: string;
  desiredDeliveryDate: string | null;
  deliveryAddress: string | null;
  constructionDesiredDate: string | null;
  constructionDetail: string | null;
  assignedUser: string | null;
  memo: string | null;
  settlementType: string | null;
  lines: CaseRegistrationLineInput[];
};

export type SaveCaseRegistrationResult =
  | { ok: true; caseId: string; caseNo: string }
  | { ok: false; errorMessage: string };

async function cleanupCase(
  client: SupabaseClient,
  caseId: string,
  casePackageIds: string[] = []
): Promise<void> {
  for (const casePackageId of casePackageIds) {
    await client
      .from("case_package_items")
      .delete()
      .eq("case_package_id", casePackageId);
    await client.from("case_packages").delete().eq("id", casePackageId);
  }
  await client.from("case_products").delete().eq("case_id", caseId);
  await client.from("case_settlements").delete().eq("case_id", caseId);
  await client.from("cases").delete().eq("id", caseId);
}

async function insertPackageExpansion(
  client: SupabaseClient,
  params: {
    caseId: string;
    packageId: string;
    quantity: number;
    supplierId: string | null;
    memo: string | null;
  }
): Promise<{ casePackageId: string | null; errorMessage: string | null }> {
  const { caseId, packageId, quantity, supplierId, memo } = params;

  const { data: pkg, error: pkgError } = await client
    .from("packages")
    .select(
      `
      id,
      name,
      package_code,
      manufacturer_id,
      series_id,
      capacity,
      capacity_unit,
      system_type,
      warranty_years,
      specification
    `
    )
    .eq("id", packageId)
    .maybeSingle();

  if (pkgError || !pkg) {
    return {
      casePackageId: null,
      errorMessage:
        pkgError?.message || "パッケージ商品の取得に失敗しました。",
    };
  }

  const [{ data: manufacturer }, { data: series }] = await Promise.all([
    pkg.manufacturer_id
      ? client
          .from("manufacturers")
          .select("name")
          .eq("id", pkg.manufacturer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    pkg.series_id
      ? client
          .from("product_series")
          .select("name")
          .eq("id", pkg.series_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: casePackage, error: casePackageError } = await client
    .from("case_packages")
    .insert({
      case_id: caseId,
      package_id: pkg.id,
      quantity,
      memo,
      package_name_snapshot: pkg.name,
      package_code_snapshot: pkg.package_code,
      manufacturer_name_snapshot: manufacturer?.name || null,
      series_name_snapshot: series?.name || null,
      capacity_snapshot: pkg.capacity,
      capacity_unit_snapshot: pkg.capacity_unit,
      system_type_snapshot: pkg.system_type,
      warranty_years_snapshot: pkg.warranty_years,
      specification_snapshot: pkg.specification,
    })
    .select("id")
    .single();

  if (casePackageError || !casePackage) {
    return {
      casePackageId: null,
      errorMessage:
        casePackageError?.message ||
        "パッケージ情報の保存に失敗しました。",
    };
  }

  const casePackageId = casePackage.id as string;

  const { data: packageItems, error: packageItemsError } = await client
    .from("package_items")
    .select(
      "id, product_id, quantity, requirement_type, selection_group, sort_order, display_name, is_hidden, products(id, name, model_no, category, product_type, unit, specification)"
    )
    .eq("package_id", packageId)
    .order("sort_order", { ascending: true });

  if (packageItemsError) {
    return {
      casePackageId,
      errorMessage:
        packageItemsError.message ||
        "パッケージ構成の取得に失敗しました。",
    };
  }

  const visibleItems = (packageItems || []).filter(
    (item) => item.is_hidden !== true
  );

  if (visibleItems.length === 0) {
    return { casePackageId, errorMessage: null };
  }

  const productIds = visibleItems
    .map((item) => item.product_id as string | null)
    .filter((id): id is string => Boolean(id));

  const priceResult = supplierId
    ? await fetchActivePurchaseUnitPrices(client, {
        productIds,
        supplierId,
      })
    : {
        unitPriceByProductId: new Map<string, number>(),
        missingProductIds: productIds,
        error: null as string | null,
      };

  const rows = visibleItems.map((item) => {
    const rawProduct = item.products as unknown;
    const product = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct;
    const itemQty = Number(item.quantity) || 0;
    const lineQty = itemQty * quantity;
    const productId = (item.product_id as string | null) || "";
    const unitPurchasePrice =
      supplierId && productId
        ? priceResult.unitPriceByProductId.get(productId) || 0
        : 0;
    const totalPurchasePrice = supplierId
      ? Math.round(unitPurchasePrice * lineQty)
      : 0;

    return {
      case_package_id: casePackageId,
      product_id: item.product_id,
      source_package_item_id: item.id,
      quantity: lineQty,
      unit_purchase_price: unitPurchasePrice,
      total_purchase_price: totalPurchasePrice,
      requirement_type: item.requirement_type,
      selection_group: item.selection_group,
      product_name_snapshot: product?.name || null,
      model_no_snapshot: product?.model_no || null,
      display_name_snapshot: item.display_name,
      product_type_snapshot: product?.product_type || null,
      category_snapshot: product?.category || null,
      unit_snapshot: product?.unit || null,
      specification_snapshot: product?.specification || null,
      is_selected: true,
      is_added_manually: false,
      is_hidden: false,
      sort_order: item.sort_order || 0,
    };
  });

  const { error: itemsInsertError } = await client
    .from("case_package_items")
    .insert(rows);

  if (itemsInsertError) {
    return {
      casePackageId,
      errorMessage:
        itemsInsertError.message ||
        "パッケージ構成の保存に失敗しました。",
    };
  }

  return { casePackageId, errorMessage: null };
}

/**
 * 案件登録（ヘッダ + 複数明細 + 任意の決済区分）。
 * 価格は呼び出し側で解決済みのスナップショット値を保存する。
 */
export async function saveCaseRegistration(
  client: SupabaseClient,
  input: CaseRegistrationInput
): Promise<SaveCaseRegistrationResult> {
  if (!input.dealerId) {
    return { ok: false, errorMessage: "販売店を選択してください。" };
  }
  if (!input.customerName.trim()) {
    return { ok: false, errorMessage: "顧客名を入力してください。" };
  }
  if (!input.orderReceivedDate) {
    return { ok: false, errorMessage: "受注日を入力してください。" };
  }
  if (input.lines.length === 0) {
    return { ok: false, errorMessage: "商品明細を1件以上追加してください。" };
  }

  for (const [index, line] of input.lines.entries()) {
    const n = index + 1;
    if (line.lineType === "PRODUCT" && !line.productId) {
      return { ok: false, errorMessage: `明細${n}: 商品を選択してください。` };
    }
    if (line.lineType === "PACKAGE" && !line.packageId) {
      return {
        ok: false,
        errorMessage: `明細${n}: パッケージ商品を選択してください。`,
      };
    }
    if (!line.supplierId) {
      return {
        ok: false,
        errorMessage: `明細${n}: 仕入先を選択してください。`,
      };
    }
    if (!(line.quantity > 0)) {
      return {
        ok: false,
        errorMessage: `明細${n}: 数量は1以上を入力してください。`,
      };
    }
    if (!(line.unitSalesPrice > 0)) {
      return {
        ok: false,
        errorMessage:
          line.isManualPrice
            ? `明細${n}: 販売価格を入力してください。`
            : `明細${n}: 販売価格が登録されていません。`,
      };
    }
  }

  const caseNo = input.caseNo.trim() || `VE-${Date.now()}`;
  const productNameSummary = input.lines
    .map((line) => line.displayName)
    .filter(Boolean)
    .join(" / ")
    .slice(0, 200);
  const quantitySummary = input.lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0),
    0
  );

  const { data: caseRow, error: caseError } = await client
    .from("cases")
    .insert({
      case_no: caseNo,
      dealer_id: input.dealerId,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone,
      site_address: input.siteAddress,
      order_type: input.orderType,
      product_name: productNameSummary || null,
      quantity: quantitySummary || null,
      order_received_date: input.orderReceivedDate,
      desired_delivery_date: input.desiredDeliveryDate,
      delivery_address: input.deliveryAddress,
      construction_desired_date: input.constructionDesiredDate,
      construction_detail: input.constructionDetail,
      assigned_user: input.assignedUser,
      memo: input.memo,
      status: "新規受付",
    })
    .select("id, case_no")
    .single();

  if (caseError || !caseRow) {
    return {
      ok: false,
      errorMessage: caseError?.message || "案件の保存に失敗しました。",
    };
  }

  const caseId = caseRow.id as string;
  const casePackageIds: string[] = [];

  if (input.settlementType) {
    const { error: settlementError } = await client
      .from("case_settlements")
      .insert({
        case_id: caseId,
        settlement_type: input.settlementType,
        fee_amount: 0,
      });

    if (settlementError) {
      await cleanupCase(client, caseId);
      return {
        ok: false,
        errorMessage:
          settlementError.message || "決済区分の保存に失敗しました。",
      };
    }
  }

  const caseProductRows = input.lines.map((line) => {
    const qty = Number(line.quantity) || 0;
    const salesTotal = Math.round(line.unitSalesPrice * qty);
    const purchaseTotal = Math.round(line.unitPurchasePrice * qty);
    return {
      case_id: caseId,
      line_type: line.lineType,
      product_id: line.lineType === "PRODUCT" ? line.productId : null,
      package_id: line.lineType === "PACKAGE" ? line.packageId : null,
      supplier_id: line.supplierId,
      quantity: qty,
      sales_price: salesTotal,
      purchase_price: purchaseTotal,
      gross_profit: salesTotal - purchaseTotal,
      sales_price_id: line.salesPriceId,
      purchase_price_id: line.purchasePriceId,
      is_manual_price: line.isManualPrice,
      memo: line.memo,
    };
  });

  const { error: productsError } = await client
    .from("case_products")
    .insert(caseProductRows);

  if (productsError) {
    await cleanupCase(client, caseId);
    const hint =
      /line_type|package_id|sales_price_id|purchase_price_id|is_manual_price|column .* does not exist/i.test(
        productsError.message
      )
        ? "（case_products の価格スナップショットDDL未適用の可能性があります。supabase/migrations/20260726190000_case_products_price_snapshot.sql を適用してください）"
        : "";
    return {
      ok: false,
      errorMessage: `${productsError.message}${hint}`,
    };
  }

  for (const line of input.lines) {
    if (line.lineType !== "PACKAGE" || !line.packageId) continue;

    const expanded = await insertPackageExpansion(client, {
      caseId,
      packageId: line.packageId,
      quantity: line.quantity,
      supplierId: line.supplierId,
      memo: line.memo,
    });

    if (expanded.errorMessage) {
      await cleanupCase(client, caseId, casePackageIds);
      return { ok: false, errorMessage: expanded.errorMessage };
    }

    if (expanded.casePackageId) {
      casePackageIds.push(expanded.casePackageId);
    }
  }

  return {
    ok: true,
    caseId,
    caseNo: (caseRow.case_no as string) || caseNo,
  };
}
