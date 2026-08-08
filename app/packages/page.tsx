import Link from "next/link";

import {
  fetchListCurrentPurchaseUnitPrices,
} from "@/lib/purchasePrices";
import { supabase } from "@/lib/supabase";

import MasterListRowActions from "@/app/components/masters/MasterListRowActions";

import PackageListSearchForm from "./PackageListSearchForm";
import {
  filterPackageListRows,
  parsePackageListQuery,
  sortPackageListRows,
  type PackageListRow,
} from "./packageListQuery";

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

type PackageFetchRow = {
  id: string;
  name: string | null;
  package_code: string | null;
  capacity: number | string | null;
  capacity_unit: string | null;
  system_type: string | null;
  warranty_years: number | null;
  is_active: unknown;
  manufacturer_id: string | null;
  default_supplier_id: string | null;
  manufacturers: { name: string | null } | { name: string | null }[] | null;
  series: { name: string | null } | { name: string | null }[] | null;
  suppliers: { name: string | null } | { name: string | null }[] | null;
};

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    manufacturer_id?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const query = parsePackageListQuery(params);

  const [{ data: packages, error }, { data: manufacturers }] = await Promise.all([
    supabase
      .from("packages")
      .select(
        `
      id,
      name,
      package_code,
      capacity,
      capacity_unit,
      system_type,
      warranty_years,
      is_active,
      manufacturer_id,
      default_supplier_id,
      manufacturers ( name ),
      series:series_id ( name ),
      suppliers:default_supplier_id ( name )
    `
      )
      .order("name", { ascending: true }),
    supabase
      .from("manufacturers")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  const rawRows = (packages || []) as PackageFetchRow[];
  const listRows: PackageListRow[] = rawRows.map((item) => ({
    id: item.id,
    name: item.name,
    is_active: item.is_active,
    manufacturer_id: item.manufacturer_id,
    manufacturerName: relationName(item.manufacturers),
    seriesName: relationName(item.series),
  }));

  const filtered = sortPackageListRows(filterPackageListRows(listRows, query));
  const order = new Map(filtered.map((r, i) => [r.id, i]));
  const visible = rawRows
    .filter((row) => order.has(row.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const supplierByTargetId = new Map<string, string>();
  for (const row of visible) {
    const supplierId = (row.default_supplier_id || "").trim();
    if (supplierId) supplierByTargetId.set(row.id, supplierId);
  }
  const purchasePrices = await fetchListCurrentPurchaseUnitPrices(supabase, {
    targetType: "PACKAGE",
    supplierByTargetId,
  });

  const manufacturerOptions = (manufacturers || [])
    .map((m) => ({
      id: m.id as string,
      name: ((m.name as string | null) || "").trim() || "名称未設定",
    }))
    .filter((m) => m.id);

  const hasFilters =
    Boolean(query.q) ||
    Boolean(query.manufacturerId) ||
    query.status !== "all";

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              パッケージ商品一覧
            </h1>
            <p className="text-sm text-gray-500">
              パッケージ構成・保証を管理します
            </p>
          </div>
          <Link
            href="/packages/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ パッケージ商品登録
          </Link>
        </div>
      </header>

      <main className="p-8">
        <PackageListSearchForm
          q={query.q}
          manufacturerId={query.manufacturerId}
          status={query.status}
          manufacturers={manufacturerOptions}
          resultCount={visible.length}
        />

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">シリーズ</th>
                <th className="px-5 py-4">パッケージ名</th>
                <th className="px-5 py-4">容量</th>
                <th className="px-5 py-4">保証</th>
                <th className="px-5 py-4">標準仕入先</th>
                <th className="px-5 py-4">現行仕入価格</th>
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
              ) : purchasePrices.error ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-red-500">
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
                      <td className="px-5 py-4">
                        <Link
                          href={`/packages/${item.id}`}
                          className="font-semibold text-gray-900 underline-offset-2 hover:underline"
                        >
                          {item.name || "-"}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        {item.capacity != null
                          ? `${item.capacity}${item.capacity_unit || ""}`
                          : "-"}
                      </td>
                      <td className="px-5 py-4">
                        {item.warranty_years != null
                          ? `${item.warranty_years}年`
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
                          label={item.name || "パッケージ"}
                          items={[
                            {
                              label: "編集",
                              href: `/packages/${item.id}/edit`,
                            },
                            {
                              label: "仕入価格を追加",
                              href: `/prices/new?package_id=${item.id}`,
                            },
                            {
                              label: "販売価格を追加",
                              href: `/sales-prices/new?package_id=${item.id}`,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-gray-500">
                    {hasFilters
                      ? "条件に一致するパッケージがありません"
                      : "パッケージ商品が登録されていません。"}
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
