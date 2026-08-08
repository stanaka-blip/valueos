import Link from "next/link";

import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Contractor = {
  id: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  delivery_name: string | null;
  delivery_address: string | null;
  receiver_name: string | null;
  is_active: boolean | null;
};

function displayText(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  return trimmed || "—";
}

export default async function ContractorsPage() {
  const { data: contractors, error } = await supabase
    .from("contractors")
    .select(
      "id, name, address, phone, delivery_name, delivery_address, receiver_name, is_active"
    )
    .order("name", { ascending: true });

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">施工店一覧</h1>
            <p className="text-sm text-gray-500">
              施工店の所在地・標準納品先・荷受け担当者を管理します
            </p>
          </div>

          <Link
            href="/contractors/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ 施工店登録
          </Link>
        </div>
      </header>

      <main className="p-8">
        <p className="mb-6 text-sm text-gray-500">
          登録件数：{contractors?.length ?? 0}件
        </p>

        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-4">施工店名</th>
                <th className="whitespace-nowrap px-5 py-4">住所</th>
                <th className="whitespace-nowrap px-5 py-4">電話番号</th>
                <th className="whitespace-nowrap px-5 py-4">標準納品先</th>
                <th className="whitespace-nowrap px-5 py-4">荷受け担当者</th>
                <th className="whitespace-nowrap px-5 py-4">状態</th>
                <th className="whitespace-nowrap px-5 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-red-600">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : contractors && contractors.length > 0 ? (
                (contractors as Contractor[]).map((row) => {
                  const deliveryLabel =
                    displayText(row.delivery_name) !== "—"
                      ? displayText(row.delivery_name)
                      : displayText(row.delivery_address);
                  return (
                    <tr
                      key={row.id}
                      className="border-b last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">
                        {displayText(row.name)}
                      </td>
                      <td className="max-w-[220px] px-5 py-4 text-gray-700">
                        <span className="line-clamp-2">
                          {displayText(row.address)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                        {displayText(row.phone)}
                      </td>
                      <td className="max-w-[220px] px-5 py-4 text-gray-700">
                        <span className="line-clamp-2">{deliveryLabel}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                        {displayText(row.receiver_name)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            row.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {row.is_active ? "有効" : "無効"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-center">
                        <Link
                          href={`/contractors/${row.id}/edit`}
                          className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-700"
                        >
                          編集
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    まだ施工店が登録されていません。
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
