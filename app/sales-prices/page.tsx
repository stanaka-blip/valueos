import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SalesPricesPage() {
  const { data: prices, error } = await supabase
    .from("sales_prices")
    .select(`
      *,
      dealers (
        name
      ),
      products (
        name,
        model_no,
        category,
        manufacturers (
          name
        )
      )
    `)
    .order("created_at", { ascending: false });

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              販売価格マスタ
            </h1>
            <p className="text-sm text-gray-500">
              販売店ごとの商品販売価格を管理します
            </p>
          </div>

          <Link
            href="/sales-prices/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ 販売価格登録
          </Link>
        </div>
      </header>

      <main className="p-8">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">販売店</th>
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">カテゴリ</th>
                <th className="px-5 py-4">品番</th>
                <th className="px-5 py-4">商品名</th>
                <th className="px-5 py-4">販売価格</th>
                <th className="px-5 py-4">適用開始</th>
                <th className="px-5 py-4">適用終了</th>
                <th className="px-5 py-4">状態</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : prices && prices.length > 0 ? (
                prices.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="px-5 py-4 font-semibold">
                      {item.dealers?.name || "-"}
                    </td>
                    <td className="px-5 py-4">
                      {item.products?.manufacturers?.name || "-"}
                    </td>
                    <td className="px-5 py-4">
                      {item.products?.category || "-"}
                    </td>
                    <td className="px-5 py-4">
                      {item.products?.model_no || "-"}
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {item.products?.name || "-"}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {item.sales_price
                        ? `${Number(item.sales_price).toLocaleString()}円`
                        : "-"}
                    </td>
                    <td className="px-5 py-4">{item.start_date || "-"}</td>
                    <td className="px-5 py-4">{item.end_date || "-"}</td>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-gray-500">
                    販売価格が登録されていません。
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