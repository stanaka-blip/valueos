import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import {
  MAX_PACKAGE_ITEMS,
  validateAddCaseLineBody,
  type AddCaseLineBody,
  type AddCaseLineFieldErrors,
  type ValidatedCaseLine,
} from "./addCaseLineLogic";

export type AddCaseLineResult =
  | {
      ok: true;
      case_product_id: string;
      case_package_id?: string;
      line_type: "PRODUCT" | "PACKAGE";
    }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFIG_ERROR"
        | "PACKAGE_ITEMS_NOT_FOUND"
        | "LINE_ADD_FAILED";
      error_message: string;
      field_errors?: AddCaseLineFieldErrors;
    };

type AdminClient = SupabaseClient<Database>;

/** types 未掲載テーブル向け（DBスキーマは登録RPCと同一） */
function untyped(client: AdminClient) {
  return client as unknown as SupabaseClient;
}

type PackageItemRow = {
  id: string;
  product_id: string | null;
  quantity: number | null;
  requirement_type: string | null;
  selection_group: string | null;
  sort_order: number | null;
  display_name: string | null;
  is_hidden: boolean | null;
  products:
    | {
        id: string;
        name: string | null;
        model_no: string | null;
        category: string | null;
        product_type: string | null;
        unit: string | null;
        specification: string | null;
      }
    | {
        id: string;
        name: string | null;
        model_no: string | null;
        category: string | null;
        product_type: string | null;
        unit: string | null;
        specification: string | null;
      }[]
    | null;
};

type PackageRow = {
  id: string;
  name: string | null;
  package_code: string | null;
  manufacturer_id: string | null;
  series_id: string | null;
  capacity: number | null;
  capacity_unit: string | null;
  system_type: string | null;
  warranty_years: number | null;
  specification: string | null;
};

async function cleanupLineArtifacts(
  client: AdminClient,
  caseProductId: string | null,
  casePackageId: string | null
): Promise<void> {
  const db = untyped(client);
  if (casePackageId) {
    await db
      .from("case_package_items")
      .delete()
      .eq("case_package_id", casePackageId);
    await client.from("case_packages").delete().eq("id", casePackageId);
  }
  if (caseProductId) {
    await client.from("case_products").delete().eq("id", caseProductId);
  }
}

async function assertCaseExists(
  client: AdminClient,
  caseId: string
): Promise<AddCaseLineResult | { ok: true }> {
  const { data, error } = await client
    .from("cases")
    .select("id")
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }
  if (!data) {
    return {
      ok: false,
      error_code: "NOT_FOUND",
      error_message: "案件が見つかりません",
    };
  }
  return { ok: true };
}

async function insertProductLine(
  client: AdminClient,
  caseId: string,
  line: ValidatedCaseLine
): Promise<AddCaseLineResult> {
  const { data: product, error: productError } = await client
    .from("products")
    .select("id")
    .eq("id", line.product_id as string)
    .maybeSingle();

  if (productError) {
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }
  if (!product) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
      field_errors: { product_id: "商品が正しくありません" },
    };
  }

  const { data: inserted, error: insertError } = await client
    .from("case_products")
    .insert({
      case_id: caseId,
      line_type: "PRODUCT",
      product_id: line.product_id,
      package_id: null,
      supplier_id: null,
      quantity: line.quantity,
      sales_price: null,
      purchase_price: null,
      gross_profit: null,
      sales_price_id: null,
      purchase_price_id: null,
      is_manual_price: false,
      price_fetched_at: null,
      memo: line.memo,
    })
    .select(
      "id, line_type, product_id, package_id, supplier_id, sales_price, purchase_price, gross_profit, quantity"
    )
    .single();

  if (insertError || !inserted) {
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }

  if (
    inserted.line_type !== "PRODUCT" ||
    inserted.product_id !== line.product_id ||
    inserted.package_id != null ||
    inserted.supplier_id != null ||
    inserted.sales_price != null ||
    inserted.purchase_price != null ||
    inserted.gross_profit != null ||
    Number(inserted.quantity) !== line.quantity
  ) {
    await cleanupLineArtifacts(client, inserted.id, null);
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }

  return {
    ok: true,
    case_product_id: inserted.id,
    line_type: "PRODUCT",
  };
}

async function insertPackageLine(
  client: AdminClient,
  caseId: string,
  line: ValidatedCaseLine
): Promise<AddCaseLineResult> {
  const packageId = line.package_id as string;
  const db = untyped(client);

  const { data: pkg, error: pkgError } = await db
    .from("packages")
    .select(
      "id, name, package_code, manufacturer_id, series_id, capacity, capacity_unit, system_type, warranty_years, specification"
    )
    .eq("id", packageId)
    .maybeSingle();

  if (pkgError) {
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }
  if (!pkg) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
      field_errors: { package_id: "パッケージが正しくありません" },
    };
  }

  const packageRow = pkg as PackageRow;

  const { data: packageItems, error: itemsError } = await db
    .from("package_items")
    .select(
      "id, product_id, quantity, requirement_type, selection_group, sort_order, display_name, is_hidden, products(id, name, model_no, category, product_type, unit, specification)"
    )
    .eq("package_id", packageId)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }

  const visibleItems = ((packageItems || []) as PackageItemRow[]).filter(
    (item) => item.is_hidden !== true
  );

  if (visibleItems.length < 1) {
    return {
      ok: false,
      error_code: "PACKAGE_ITEMS_NOT_FOUND",
      error_message: "パッケージ構成が登録されていません",
    };
  }
  if (visibleItems.length > MAX_PACKAGE_ITEMS) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "パッケージ構成が上限を超えています",
    };
  }

  let caseProductId: string | null = null;
  let casePackageId: string | null = null;

  try {
    const { data: caseProduct, error: cpError } = await client
      .from("case_products")
      .insert({
        case_id: caseId,
        line_type: "PACKAGE",
        product_id: null,
        package_id: packageId,
        supplier_id: null,
        quantity: line.quantity,
        sales_price: null,
        purchase_price: null,
        gross_profit: null,
        sales_price_id: null,
        purchase_price_id: null,
        is_manual_price: false,
        price_fetched_at: null,
        memo: line.memo,
      })
      .select("id, line_type, product_id, package_id, sales_price, purchase_price, gross_profit")
      .single();

    if (cpError || !caseProduct) {
      return {
        ok: false,
        error_code: "LINE_ADD_FAILED",
        error_message: "明細を追加できませんでした",
      };
    }
    caseProductId = caseProduct.id;

    if (
      caseProduct.line_type !== "PACKAGE" ||
      caseProduct.package_id !== packageId ||
      caseProduct.product_id != null ||
      caseProduct.sales_price != null ||
      caseProduct.purchase_price != null ||
      caseProduct.gross_profit != null
    ) {
      throw new Error("verify_failed");
    }

    let manufacturerName: string | null = null;
    let seriesName: string | null = null;
    if (packageRow.manufacturer_id) {
      const { data: mfr } = await db
        .from("manufacturers")
        .select("name")
        .eq("id", packageRow.manufacturer_id)
        .maybeSingle();
      manufacturerName = (mfr?.name as string | null) || null;
    }
    if (packageRow.series_id) {
      const { data: series } = await db
        .from("product_series")
        .select("name")
        .eq("id", packageRow.series_id)
        .maybeSingle();
      seriesName = (series?.name as string | null) || null;
    }

    const { data: casePackage, error: cpkgError } = await db
      .from("case_packages")
      .insert({
        case_id: caseId,
        package_id: packageId,
        quantity: line.quantity,
        memo: line.memo,
        case_product_id: caseProductId,
        package_name_snapshot: packageRow.name,
        package_code_snapshot: packageRow.package_code,
        manufacturer_name_snapshot: manufacturerName,
        series_name_snapshot: seriesName,
        capacity_snapshot: packageRow.capacity,
        capacity_unit_snapshot: packageRow.capacity_unit,
        system_type_snapshot: packageRow.system_type,
        warranty_years_snapshot: packageRow.warranty_years,
        specification_snapshot: packageRow.specification,
      })
      .select("id")
      .single();

    if (cpkgError || !casePackage) {
      throw new Error("case_package_insert_failed");
    }
    casePackageId = casePackage.id as string;

    const itemRows = visibleItems.map((item) => {
      const rawProduct = item.products;
      const product = Array.isArray(rawProduct)
        ? rawProduct[0]
        : rawProduct;
      const componentQty = Number(item.quantity) || 0;
      const itemQty = componentQty * line.quantity;

      return {
        case_package_id: casePackageId,
        product_id: item.product_id,
        source_package_item_id: item.id,
        quantity: itemQty,
        unit_purchase_price: null,
        total_purchase_price: null,
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

    const { error: itemsInsertError } = await db
      .from("case_package_items")
      .insert(itemRows);

    if (itemsInsertError) {
      throw new Error("case_package_items_insert_failed");
    }

    return {
      ok: true,
      case_product_id: caseProductId,
      case_package_id: casePackageId,
      line_type: "PACKAGE",
    };
  } catch {
    await cleanupLineArtifacts(client, caseProductId, casePackageId);
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
    };
  }
}

/**
 * 既存案件へ PRODUCT / PACKAGE 明細を1行追加（注入クライアント）。
 * 既存明細は UPDATE/DELETE しない。途中失敗時は今回分のみ補償削除。
 */
export async function addCaseLineByCaseIdWithClient(
  caseId: string,
  body: AddCaseLineBody,
  client: AdminClient
): Promise<AddCaseLineResult> {
  const validated = validateAddCaseLineBody(body);
  if (!validated.ok) {
    return validated;
  }

  const caseCheck = await assertCaseExists(client, caseId);
  if (!caseCheck.ok) {
    return caseCheck;
  }

  if (validated.line.line_type === "PRODUCT") {
    return insertProductLine(client, caseId, validated.line);
  }
  return insertPackageLine(client, caseId, validated.line);
}

/** テスト用: 補償削除を露出 */
export const __test = {
  cleanupLineArtifacts,
};
