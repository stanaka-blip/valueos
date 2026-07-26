import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SeriesPage() {
  const { data: series, error } = await supabase
    .from("product_series")
    .select(
      `
      id,
      name,
      description,
      is_active,
      manufacturers (
        name
      )
    `
    )
    .order("name", { ascending: true });

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">シリーズ一覧</h1>
            <p className="text-sm text-gray-500">
              メーカー配下のシリーズを管理します
            </p>
          </div>
          <Link
            href="/series/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ シリーズ登録
          </Link>
        </div>
      </header>

      <main className="p-8">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">シリーズ名</th>
                <th className="px-5 py-4">説明</th>
                <th className="px-5 py-4">状態</th>
                <th className="px-5 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : series && series.length > 0 ? (
                series.map((item) => {
                  const manufacturer = item.manufacturers as
                    | { name: string | null }
                    | { name: string | null }[]
                    | null;
                  const maker = Array.isArray(manufacturer)
                    ? manufacturer[0]?.name
                    : manufacturer?.name;
                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="px-5 py-4">{maker || "-"}</td>
                      <td className="px-5 py-4 font-semibold">{item.name || "-"}</td>
                      <td className="px-5 py-4 text-gray-600">
                        {item.description || "-"}
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
                          href={`/series/${item.id}/edit`}
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
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-500">
                    シリーズが登録されていません。
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
