import Link from "next/link";

import {
  fetchListCurrentPurchaseUnitPrices,
} from "@/lib/purchasePrices";
import { supabase } from "@/lib/supabase";

import MasterListRowActions from "@/app/components/masters/MasterListRowActions";

import ProductListSearchForm from "./ProductListSearchForm";
import {
  filterProductListRows,
  parseProductListQuery,
  sortProductListRows,
  type ProductListRow,
} from "./productListQuery";

export const dynamic = "force-dynamic";

function formatYen(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString("ja-JP")}円`;
}

function supplierName(
  suppliers:
    | { name: string | null }
    | { name: string | null }[]
    | null
    | undefined
): string {
  if (!suppliers) return "未設定";
  const row = Array.isArray(suppliers) ? suppliers[0] : suppliers;
  return row?.name?.trim() || "未設定";
}

function relationName(
  value:
    | { name: string | null }
    | { name: string | null }[]
    | null
    | undefined
): string {
  if (!value) return "";
  const row = Array.isArray(value) ? value[0] : value;
  return (row?.name || "").trim();
}

type ProductFetchRow = {
  id: string;
  name: string | null;
  category: string | null;
  model_no: string | null;
  capacity: string | null;
  unit: string | null;
  is_active: unknown;
  manufacturer_id: string | null;
  default_supplier_id: string | null;
  manufacturers: { name: string | null } | { name: string | null }[] | null;
  series: { name: string | null } | { name: string | null }[] | null;
  suppliers: { name: string | null } | { name: string | null }[] | null;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    manufacturer_id?: string;
    category?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const query = parseProductListQuery(params);

  const [{ data: products, error }, { data: manufacturers }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
      id,
      name,
      category,
      model_no,
      capacity,
      unit,
      is_active,
      manufacturer_id,
      default_supplier_id,
      manufacturers ( name ),
      series:series_id ( name ),
      suppliers:default_supplier_id ( name )
    `
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("manufacturers")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  const rawRows = (products || []) as ProductFetchRow[];
  const listRows: ProductListRow[] = rawRows.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    model_no: item.model_no,
    is_active: item.is_active,
    manufacturer_id: item.manufacturer_id,
    manufacturerName: relationName(item.manufacturers),
  }));

  const filtered = sortProductListRows(filterProductListRows(listRows, query));
  const filteredIds = new Set(filtered.map((r) => r.id));
  const visible = rawRows
    .filter((row) => filteredIds.has(row.id))
    .sort((a, b) => {
      const ai = filtered.findIndex((r) => r.id === a.id);
      const bi = filtered.findIndex((r) => r.id === b.id);
      return ai - bi;
    });

  const supplierByTargetId = new Map<string, string>();
  for (const row of visible) {
    const supplierId = (row.default_supplier_id || "").trim();
    if (supplierId) supplierByTargetId.set(row.id, supplierId);
  }
  const purchasePrices = await fetchListCurrentPurchaseUnitPrices(supabase, {
    targetType: "PRODUCT",
    supplierByTargetId,
  });

  const categories = Array.from(
    new Set(
      rawRows
        .map((r) => (r.category || "").trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b, "ja"));

  const manufacturerOptions = (manufacturers || [])
    .map((m) => ({
      id: m.id as string,
      name: ((m.name as string | null) || "").trim() || "名称未設定",
    }))
    .filter((m) => m.id);

  const hasFilters =
    Boolean(query.q) ||
    Boolean(query.manufacturerId) ||
    Boolean(query.category) ||
    query.status !== "all";

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">商品一覧</h1>
            <p className="text-sm text-gray-500">
              メーカー・シリーズ配下の商品を管理します
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/products/setup"
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
            >
              ＋ 商品セットアップ（一括）
            </Link>
            <Link
              href="/products/new"
              className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700"
            >
              1件登録
            </Link>
          </div>
        </div>
      </header>

      <main className="p-8">
        <ProductListSearchForm
          q={query.q}
          manufacturerId={query.manufacturerId}
          category={query.category}
          status={query.status}
          manufacturers={manufacturerOptions}
          categories={categories}
          resultCount={visible.length}
        />

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">シリーズ</th>
                <th className="px-5 py-4">カテゴリ</th>
                <th className="px-5 py-4">型番</th>
                <th className="px-5 py-4">商品名</th>
                <th className="px-5 py-4">容量</th>
                <th className="px-5 py-4">標準仕入先</th>
                <th className="px-5 py-4">現行仕入価格</th>
                <th className="px-5 py-4">状態</th>
                <th className="px-5 py-4 text-center">操作</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : purchasePrices.error ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-red-500">
                    仕入価格の取得エラー：{purchasePrices.error}
                  </td>
                </tr>
              ) : visible.length > 0 ? (
                visible.map((item) => {
                  const maker = relationName(item.manufacturers) || "-";
                  const seriesName = relationName(item.series) || "-";
                  const defaultSupplier = supplierName(item.suppliers);
                  const currentPurchase =
                    purchasePrices.unitPriceByTargetId.get(item.id) ?? null;

                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="px-5 py-4 font-semibold">{maker}</td>
                      <td className="px-5 py-4">{seriesName}</td>
                      <td className="px-5 py-4">{item.category || "-"}</td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/products/${item.id}`}
                          className="font-semibold text-gray-900 underline-offset-2 hover:underline"
                        >
                          {item.model_no || "-"}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/products/${item.id}`}
                          className="font-semibold text-gray-900 underline-offset-2 hover:underline"
                        >
                          {item.name || "-"}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        {item.capacity
                          ? `${item.capacity}${item.unit ? item.unit : ""}`
                          : "-"}
                      </td>
                      <td className="px-5 py-4">
                        {defaultSupplier === "未設定" ? (
                          <span className="text-gray-500">未設定</span>
                        ) : (
                          defaultSupplier
                        )}
                      </td>
                      <td className="px-5 py-4 font-semibold tabular-nums">
                        {formatYen(currentPurchase)}
                      </td>
                      <td className="px-5 py-4">
                        {item.is_active ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                            有効
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-700">
                            停止
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <MasterListRowActions
                          label={item.name || item.model_no || "商品"}
                          items={[
                            {
                              label: "編集",
                              href: `/products/${item.id}/edit`,
                            },
                            {
                              label: "仕入価格を追加",
                              href: `/prices/new?product_id=${item.id}`,
                            },
                            {
                              label: "販売価格を追加",
                              href: `/sales-prices/new?product_id=${item.id}`,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-gray-500">
                    {hasFilters
                      ? "条件に一致する商品がありません"
                      : "商品が登録されていません。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
