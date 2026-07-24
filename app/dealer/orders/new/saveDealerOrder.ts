import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

import type {
  DealerOrderCaseForm,
  DealerOrderProductForm,
} from "./types";

export type SaveDealerOrderResult =
  | { ok: true; caseId: string; caseNo: string }
  | { ok: false; errorMessage: string };

function buildCaseMemo(form: DealerOrderCaseForm): string {
  const lines = [
    form.case_memo.trim() ? `【案件備考】${form.case_memo.trim()}` : "",
    form.dealer_contact.trim()
      ? `【販売店担当者】${form.dealer_contact.trim()}`
      : "",
    form.customer_name_kana.trim()
      ? `【顧客名カナ】${form.customer_name_kana.trim()}`
      : "",
    form.postal_code.trim() ? `【郵便番号】${form.postal_code.trim()}` : "",
    form.delivery_type ? `【納品先区分】${form.delivery_type}` : "",
    form.delivery_name.trim()
      ? `【納品先名称】${form.delivery_name.trim()}`
      : "",
    form.delivery_postal_code.trim()
      ? `【納品先郵便番号】${form.delivery_postal_code.trim()}`
      : "",
    form.receiver_name.trim()
      ? `【荷受け担当者】${form.receiver_name.trim()}`
      : "",
    form.receiver_phone.trim()
      ? `【荷受け電話番号】${form.receiver_phone.trim()}`
      : "",
    form.receiving_hours.trim()
      ? `【荷受け可能時間】${form.receiving_hours.trim()}`
      : "",
    form.delivery_notes.trim()
      ? `【納品時注意事項】${form.delivery_notes.trim()}`
      : "",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildConstructionDetail(form: DealerOrderCaseForm): string {
  const lines = [
    form.contractor_name.trim()
      ? `【施工店名】${form.contractor_name.trim()}`
      : "",
    form.contractor_contact.trim()
      ? `【施工店担当者】${form.contractor_contact.trim()}`
      : "",
    form.contractor_phone.trim()
      ? `【施工店電話番号】${form.contractor_phone.trim()}`
      : "",
  ];

  return lines.filter(Boolean).join("\n");
}

async function resolveDealerId(
  client: SupabaseClient,
  dealerName: string
): Promise<string | null> {
  const trimmed = dealerName.trim();

  if (trimmed) {
    const { data: matched } = await client
      .from("dealers")
      .select("id")
      .eq("name", trimmed)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (matched?.id) {
      return matched.id as string;
    }
  }

  const { data: fallback } = await client
    .from("dealers")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (fallback?.id as string | undefined) || null;
}

async function cleanupCase(
  client: SupabaseClient,
  caseId: string,
  casePackageId?: string | null
) {
  if (casePackageId) {
    await client
      .from("case_package_items")
      .delete()
      .eq("case_package_id", casePackageId);
    await client.from("case_packages").delete().eq("id", casePackageId);
  }

  await client.from("case_products").delete().eq("case_id", caseId);
  await client.from("cases").delete().eq("id", caseId);
}

/**
 * STEP4 送信時の保存。
 * - ステータスは Phase0 正式値「新規受付」を書き込む
 * - memo / construction_detail の【ラベル】形式は admin parseCaseExtras と互換
 * - 既知ギャップ（販売店フォールバック、パッケージ時 case_products 空など）は未改修
 */
export async function saveDealerOrder(params: {
  caseForm: DealerOrderCaseForm;
  productForm: DealerOrderProductForm;
}): Promise<SaveDealerOrderResult> {
  const { caseForm, productForm } = params;
  const client = supabase;

  try {
    const dealerId = await resolveDealerId(client, caseForm.dealer_name);
    if (!dealerId) {
      return {
        ok: false,
        errorMessage: "販売店マスタを取得できませんでした。",
      };
    }

    let productName = "";
    let quantity = 1;

    if (productForm.order_category === "パッケージで発注") {
      const { data: pkg, error: pkgError } = await client
        .from("packages")
        .select(
          "id, name, package_code, manufacturer_id, series_id, capacity, capacity_unit, system_type, warranty_years, specification"
        )
        .eq("id", productForm.package_id)
        .single();

      if (pkgError || !pkg) {
        return {
          ok: false,
          errorMessage: "パッケージ情報の取得に失敗しました。",
        };
      }

      productName = (pkg.name as string) || "パッケージ";
      quantity = Number(productForm.quantity) || 1;

      const caseNo = `VE-${Date.now()}`;
      const { data: caseRow, error: caseError } = await client
        .from("cases")
        .insert({
          case_no: caseNo,
          dealer_id: dealerId,
          customer_name: caseForm.customer_name.trim(),
          customer_phone: caseForm.customer_phone.trim(),
          site_address: caseForm.site_address.trim(),
          order_type: productForm.order_category,
          product_name: productName,
          quantity,
          desired_delivery_date: caseForm.desired_delivery_date || null,
          delivery_address: caseForm.delivery_address.trim(),
          construction_desired_date: caseForm.construction_date || null,
          construction_detail: buildConstructionDetail(caseForm) || null,
          status: "新規受付",
          department: "営業",
          assigned_user: caseForm.dealer_contact.trim(),
          priority: "中",
          memo: buildCaseMemo(caseForm) || null,
        })
        .select("id, case_no")
        .single();

      if (caseError || !caseRow) {
        return {
          ok: false,
          errorMessage:
            caseError?.message || "案件情報の保存に失敗しました。",
        };
      }

      const caseId = caseRow.id as string;

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
          memo: productForm.product_memo.trim() || null,
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
        await cleanupCase(client, caseId);
        return {
          ok: false,
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
        .eq("package_id", pkg.id)
        .order("sort_order", { ascending: true });

      if (packageItemsError) {
        await cleanupCase(client, caseId, casePackageId);
        return {
          ok: false,
          errorMessage:
            packageItemsError.message ||
            "パッケージアイテムの取得に失敗しました。",
        };
      }

      const visibleItems = (packageItems || []).filter(
        (item) => item.is_hidden !== true
      );

      if (visibleItems.length > 0) {
        const rows = visibleItems.map((item) => {
          const rawProduct = item.products as unknown;
          const product = Array.isArray(rawProduct)
            ? rawProduct[0]
            : rawProduct;

          const itemQty = Number(item.quantity) || 0;

          return {
            case_package_id: casePackageId,
            product_id: item.product_id,
            source_package_item_id: item.id,
            quantity: itemQty * quantity,
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
          await cleanupCase(client, caseId, casePackageId);
          return {
            ok: false,
            errorMessage:
              itemsInsertError.message ||
              "パッケージアイテムの保存に失敗しました。",
          };
        }
      }

      return {
        ok: true,
        caseId,
        caseNo: (caseRow.case_no as string) || caseNo,
      };
    }

    if (productForm.order_category === "部材のみ発注") {
      const productIds = productForm.part_lines
        .map((line) => line.product_id)
        .filter(Boolean);

      const { data: products, error: productsError } = await client
        .from("products")
        .select("id, name")
        .in("id", productIds);

      if (productsError) {
        return {
          ok: false,
          errorMessage: "商品情報の取得に失敗しました。",
        };
      }

      const productNameById = new Map(
        (products || []).map((product) => [
          product.id as string,
          (product.name as string) || "名称未設定",
        ])
      );

      const names = productForm.part_lines
        .map((line) => productNameById.get(line.product_id) || "")
        .filter(Boolean);

      productName = names.join(" / ") || "部材";
      quantity = productForm.part_lines.reduce((sum, line) => {
        const qty = Number(line.quantity);
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0);

      const caseNo = `VE-${Date.now()}`;
      const { data: caseRow, error: caseError } = await client
        .from("cases")
        .insert({
          case_no: caseNo,
          dealer_id: dealerId,
          customer_name: caseForm.customer_name.trim(),
          customer_phone: caseForm.customer_phone.trim(),
          site_address: caseForm.site_address.trim(),
          order_type: productForm.order_category,
          product_name: productName,
          quantity: quantity || 1,
          desired_delivery_date: caseForm.desired_delivery_date || null,
          delivery_address: caseForm.delivery_address.trim(),
          construction_desired_date: caseForm.construction_date || null,
          construction_detail: buildConstructionDetail(caseForm) || null,
          status: "新規受付",
          department: "営業",
          assigned_user: caseForm.dealer_contact.trim(),
          priority: "中",
          memo: buildCaseMemo(caseForm) || null,
        })
        .select("id, case_no")
        .single();

      if (caseError || !caseRow) {
        return {
          ok: false,
          errorMessage:
            caseError?.message || "案件情報の保存に失敗しました。",
        };
      }

      const caseId = caseRow.id as string;

      const rows = productForm.part_lines.map((line) => ({
        case_id: caseId,
        product_id: line.product_id,
        quantity: Number(line.quantity) || 1,
        memo: line.product_memo.trim() || null,
      }));

      const { error: partsError } = await client
        .from("case_products")
        .insert(rows);

      if (partsError) {
        await cleanupCase(client, caseId);
        return {
          ok: false,
          errorMessage:
            partsError.message || "部材情報の保存に失敗しました。",
        };
      }

      return {
        ok: true,
        caseId,
        caseNo: (caseRow.case_no as string) || caseNo,
      };
    }

    return {
      ok: false,
      errorMessage: "発注区分が選択されていません。",
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "発注依頼の保存中にエラーが発生しました。",
    };
  }
}
