import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Dealer = {
  id: string;
  name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  payment_type: string | null;
  sales_person: string | null;
  default_profit_amount: number | null;
  is_active: boolean | null;
  suppliers: {
    name: string | null;
  } | null;
};

export const dynamic = "force-dynamic";

export default async function DealersPage() {
  const { data: dealers, error } = await supabase
    .from("dealers")
    .select(`
      *,
      suppliers (
        name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <>
        <header className="border-b bg-white px-8 py-5">
          <h1 className="text-xl font-bold text-gray-900">販売店マスタ</h1>
        </header>

        <main className="p-8">
          <div className="rounded-xl bg-red-50 p-6 text-red-700">
            データ取得エラー：{error.message}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              販売店マスタ
            </h1>
            <p className="text-sm text-gray-500">
              販売店情報・取引条件を管理します
            </p>
          </div>

          <Link
            href="/dealers/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ 販売店登録
          </Link>
        </div>
      </header>

      <main className="p-8">
        <p className="mb-6 text-sm text-gray-500">
          登録件数：{dealers?.length ?? 0}件
        </p>

        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-4">販売店名</th>
                <th className="whitespace-nowrap px-5 py-4">担当者</th>
                <th className="whitespace-nowrap px-5 py-4">電話番号</th>
                <th className="whitespace-nowrap px-5 py-4">メール</th>
                <th className="whitespace-nowrap px-5 py-4">決済条件</th>
                <th className="whitespace-nowrap px-5 py-4">担当営業</th>
                <th className="whitespace-nowrap px-5 py-4">
                  デフォルト仕入先
                </th>
                <th className="whitespace-nowrap px-5 py-4">
                  デフォルト利益
                </th>
                <th className="whitespace-nowrap px-5 py-4">状態</th>
                <th className="whitespace-nowrap px-5 py-4 text-center">
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {dealers && dealers.length > 0 ? (
                (dealers as Dealer[]).map((dealer) => (
                  <tr
                    key={dealer.id}
                    className="border-b last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">
                      {dealer.name || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                      {dealer.contact_name || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                      {dealer.phone || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                      {dealer.email || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                      {dealer.payment_type || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                      {dealer.sales_person || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                      {dealer.suppliers?.name || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">
                      {dealer.default_profit_amount !== null
                        ? `${Number(
                            dealer.default_profit_amount
                          ).toLocaleString()}円`
                        : "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          dealer.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {dealer.is_active ? "有効" : "停止"}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex justify-center gap-2">
                        <Link
                          href={`/dealers/${dealer.id}`}
                          className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
                        >
                          詳細
                        </Link>

                        <Link
                          href={`/dealers/edit/${dealer.id}`}
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
                    colSpan={10}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    まだ販売店が登録されていません。
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