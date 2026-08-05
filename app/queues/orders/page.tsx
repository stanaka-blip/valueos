import Link from "next/link";

import { loadOrderQueue } from "@/lib/queues/loadOrderQueue";
import type { OrderQueueRow } from "@/lib/queues/orderQueue";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

export default async function OrdersQueuePage() {
  const { rows, error } = await loadOrderQueue();

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          発注管理
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          発注が必要な案件（有効発注がまだない案件）を工事日が近い順に表示します
        </p>
      </header>

      <main className="p-6 md:p-8">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            発注キューの取得に失敗しました：{error}
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            現在、発注待ちの案件はありません。
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-[#f7f7f5] text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">工事日</th>
                  <th className="px-4 py-3 whitespace-nowrap">案件番号</th>
                  <th className="px-4 py-3 whitespace-nowrap">顧客名</th>
                  <th className="px-4 py-3 whitespace-nowrap">販売店</th>
                  <th className="px-4 py-3 whitespace-nowrap">発注可否</th>
                  <th className="px-4 py-3 whitespace-nowrap">理由</th>
                  <th className="px-4 py-3 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <OrderQueueTableRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function OrderQueueTableRow({ row }: { row: OrderQueueRow }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td
        className={`px-4 py-3 whitespace-nowrap ${
          row.constructionOverdue ? "text-red-600" : "text-gray-900"
        }`}
      >
        <div className="flex flex-col gap-0.5">
          <span>{formatDate(row.constructionDate)}</span>
          {row.constructionOverdue ? (
            <span className="text-xs font-medium text-red-600">
              ⚠ 期限超過
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Link
          href={row.detailHref}
          className="font-medium text-gray-900 underline-offset-2 hover:underline"
        >
          {row.caseNo}
        </Link>
      </td>
      <td className="px-4 py-3 text-gray-900">{row.customerName}</td>
      <td className="px-4 py-3 text-gray-700">{row.dealerName}</td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
        {row.canOrder ? "発注可能" : "発注不可"}
      </td>
      <td className="px-4 py-3 text-gray-500">{row.blockReason || "—"}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={row.detailHref}
            className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            詳細
          </Link>
          {row.canOrder ? (
            <Link
              href={row.orderHref}
              className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
            >
              発注登録
            </Link>
          ) : (
            <span
              title={row.blockReason || "発注できません"}
              className="cursor-not-allowed rounded-md bg-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500"
            >
              発注登録
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
