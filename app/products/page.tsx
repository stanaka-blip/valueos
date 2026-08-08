import Link from "next/link";

import { supabase } from "@/lib/supabase";

import ProductListSearchForm from "./ProductListSearchForm";
import {
  filterProductListRows,
  parseProductListQuery,
  sortProductListRows,
  type ProductListRow,
} from "./productListQuery";

export const dynamic = "force-dynamic";

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

          <Link
            href="/products/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ 商品登録
          </Link>
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
                <th className="px-5 py-4">状態</th>
                <th className="px-5 py-4 text-center">操作</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : visible.length > 0 ? (
                visible.map((item) => {
                  const maker = relationName(item.manufacturers) || "-";
                  const seriesName = relationName(item.series) || "-";
                  const defaultSupplier = supplierName(item.suppliers);

                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="px-5 py-4 font-semibold">{maker}</td>
                      <td className="px-5 py-4">{seriesName}</td>
                      <td className="px-5 py-4">{item.category || "-"}</td>
                      <td className="px-5 py-4">{item.model_no || "-"}</td>
                      <td className="px-5 py-4 font-semibold">{item.name || "-"}</td>
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
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Link
                            href={`/products/${item.id}/edit`}
                            className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white"
                          >
                            編集
                          </Link>
                          <Link
                            href={`/prices/new?product_id=${item.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800"
                          >
                            仕入価格を追加
                          </Link>
                          <Link
                            href={`/sales-prices/new?product_id=${item.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800"
                          >
                            販売価格を追加
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-gray-500">
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
