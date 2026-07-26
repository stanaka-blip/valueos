import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const { data: packages, error } = await supabase
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
      manufacturers ( name ),
      series:series_id ( name )
    `
    )
    .order("name", { ascending: true });

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
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">シリーズ</th>
                <th className="px-5 py-4">パッケージ名</th>
                <th className="px-5 py-4">容量</th>
                <th className="px-5 py-4">保証</th>
                <th className="px-5 py-4">状態</th>
                <th className="px-5 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : packages && packages.length > 0 ? (
                packages.map((item) => {
                  const manufacturer = item.manufacturers as
                    | { name: string | null }
                    | { name: string | null }[]
                    | null;
                  const series = item.series as
                    | { name: string | null }
                    | { name: string | null }[]
                    | null;
                  const maker = Array.isArray(manufacturer)
                    ? manufacturer[0]?.name
                    : manufacturer?.name;
                  const seriesName = Array.isArray(series)
                    ? series[0]?.name
                    : series?.name;
                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="px-5 py-4 font-semibold">{maker || "-"}</td>
                      <td className="px-5 py-4">{seriesName || "-"}</td>
                      <td className="px-5 py-4 font-semibold">
                        {item.name || "-"}
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
                        <Link
                          href={`/packages/${item.id}/edit`}
                          className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white"
                        >
                          編集
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                    パッケージ商品が登録されていません。
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
