import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ManufacturersPage() {
  const { data: manufacturers, error } = await supabase
    .from("manufacturers")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              メーカーマスタ
            </h1>
            <p className="text-sm text-gray-500">
              メーカー情報を管理します
            </p>
          </div>

          <Link
            href="/manufacturers/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ メーカー登録
          </Link>
        </div>
      </header>

      <main className="p-8">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">メーカー名</th>
                <th className="px-5 py-4">担当者</th>
                <th className="px-5 py-4">電話番号</th>
                <th className="px-5 py-4">メール</th>
                <th className="px-5 py-4">状態</th>
                <th className="px-5 py-4 text-center">操作</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-red-500"
                  >
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : manufacturers && manufacturers.length > 0 ? (
                manufacturers.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t hover:bg-gray-50"
                  >
                    <td className="px-5 py-4 font-semibold">
                      {item.name}
                    </td>

                    <td className="px-5 py-4">
                      {item.contact_name || "-"}
                    </td>

                    <td className="px-5 py-4">
                      {item.phone || "-"}
                    </td>

                    <td className="px-5 py-4">
                      {item.email || "-"}
                    </td>

                    <td className="px-5 py-4">
                      {item.is_active ? (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                          稼働中
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-700">
                          停止中
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <Link
                          href={`/manufacturers/${item.id}`}
                          className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-gray-100"
                        >
                          詳細
                        </Link>

                        <Link
                          href={`/manufacturers/edit/${item.id}`}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          編集
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-gray-500"
                  >
                    メーカーが登録されていません。
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