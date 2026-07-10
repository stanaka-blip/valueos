import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">仕入先マスタ</h1>
            <p className="text-sm text-gray-500">
              商社・メーカー直の取引条件を管理します
            </p>
          </div>

          <Link
            href="/suppliers/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ 仕入先登録
          </Link>
        </div>
      </header>

      <main className="p-8">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">仕入先名</th>
                <th className="px-5 py-4">種別</th>
                <th className="px-5 py-4">担当者</th>
                <th className="px-5 py-4">発注方法</th>
                <th className="px-5 py-4">締日</th>
                <th className="px-5 py-4">支払サイト</th>
                <th className="px-5 py-4">買掛上限</th>
                <th className="px-5 py-4">状態</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : suppliers && suppliers.length > 0 ? (
                suppliers.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="px-5 py-4 font-semibold">{item.name}</td>
                    <td className="px-5 py-4">{item.supplier_type || "-"}</td>
                    <td className="px-5 py-4">{item.contact_name || "-"}</td>
                    <td className="px-5 py-4">{item.order_method || "-"}</td>
                    <td className="px-5 py-4">{item.closing_day || "-"}</td>
                    <td className="px-5 py-4">{item.payment_site || "-"}</td>
                    <td className="px-5 py-4">
                      {item.credit_limit
                        ? `${Number(item.credit_limit).toLocaleString()}円`
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-500">
                    仕入先が登録されていません。
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