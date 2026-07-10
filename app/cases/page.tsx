import Link from "next/link";
import { supabase } from "@/lib/supabase";
import StatusSelect from "./StatusSelect";

type Case = {
  id: string;
  case_no: string | null;
  created_at: string | null;
  customer_name: string | null;
  order_type: string | null;
  product_name: string | null;
  quantity: number | null;
  desired_delivery_date: string | null;
  status: string | null;
  department: string | null;
  assigned_user: string | null;
  priority: string | null;
  dealers: {
    name: string | null;
  } | null;
};

export default async function CasesPage() {
  const { data: cases, error } = await supabase
    .from("cases")
    .select(`
      *,
      dealers (
        name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <>
        <header className="border-b bg-white px-8 py-5">
          <h1 className="text-xl font-bold text-gray-900">案件管理</h1>
        </header>

        <div className="p-8">
          <div className="rounded-xl bg-red-50 p-6 text-red-700">
            データ取得エラー：{error.message}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">案件管理</h1>
        <p className="text-sm text-gray-500">
          卸案件の進捗・利益を管理します
        </p>
      </header>

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            登録件数：{cases?.length ?? 0}件
          </p>

          <Link
            href="/cases/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ 案件登録
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-4">案件番号</th>
                <th className="px-4 py-4">登録日</th>
                <th className="px-4 py-4">販売店</th>
                <th className="px-4 py-4">顧客名</th>
                <th className="px-4 py-4">発注区分</th>
                <th className="px-4 py-4">商品</th>
                <th className="px-4 py-4">数量</th>
                <th className="px-4 py-4">ステータス</th>
                <th className="px-4 py-4">担当部署</th>
                <th className="px-4 py-4">担当者</th>
                <th className="px-4 py-4">希望納期</th>
                <th className="px-4 py-4">優先度</th>
              </tr>
            </thead>

            <tbody>
              {(cases as Case[] | null)?.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-4 font-bold">
                    <Link
                      href={`/cases/${item.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {item.case_no || "-"}
                    </Link>
                  </td>

                  <td className="px-4 py-4">
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString("ja-JP")
                      : "-"}
                  </td>

                  <td className="px-4 py-4 font-medium text-gray-900">
                    {item.dealers?.name || "-"}
                  </td>

                  <td className="px-4 py-4">{item.customer_name || "-"}</td>
                  <td className="px-4 py-4">{item.order_type || "-"}</td>
                  <td className="px-4 py-4">{item.product_name || "-"}</td>
                  <td className="px-4 py-4">{item.quantity || "-"}</td>

                  <td className="px-4 py-4">
                    <StatusSelect caseId={item.id} currentStatus={item.status} />
                  </td>

                  <td className="px-4 py-4">{item.department || "-"}</td>
                  <td className="px-4 py-4">{item.assigned_user || "-"}</td>
                  <td className="px-4 py-4">
                    {item.desired_delivery_date || "-"}
                  </td>
                  <td className="px-4 py-4">{item.priority || "中"}</td>
                </tr>
              ))}

              {cases?.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-6 py-10 text-center text-gray-500"
                  >
                    まだ案件が登録されていません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}