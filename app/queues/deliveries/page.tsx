import Link from "next/link";

import { loadDeliveryQueue } from "@/lib/queues/loadDeliveryQueue";
import type { DeliveryQueueRow } from "@/lib/queues/deliveryQueue";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

export default async function DeliveriesQueuePage() {
  const { rows, error } = await loadDeliveryQueue();

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          納品管理
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          発注済みで、まだ全発注が納品済みでない案件を納品予定日が近い順に表示します
        </p>
      </header>

      <main className="p-6 md:p-8">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            納品キューの取得に失敗しました：{error}
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            現在、納品確認待ちの案件はありません。
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-[#f7f7f5] text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">納品予定日</th>
                  <th className="px-4 py-3 whitespace-nowrap">工事日</th>
                  <th className="px-4 py-3 whitespace-nowrap">案件番号</th>
                  <th className="px-4 py-3 whitespace-nowrap">顧客名</th>
                  <th className="px-4 py-3 whitespace-nowrap">販売店</th>
                  <th className="px-4 py-3 whitespace-nowrap">発注数</th>
                  <th className="px-4 py-3 whitespace-nowrap">納品済数</th>
                  <th className="px-4 py-3 whitespace-nowrap">状態</th>
                  <th className="px-4 py-3 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DeliveryQueueTableRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function DeliveryQueueTableRow({ row }: { row: DeliveryQueueRow }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
        {formatDate(row.expectedDeliveryDate)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
        {formatDate(row.constructionDate)}
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
        {row.orderCount}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
        {row.deliveredCount}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
        {row.stateLabel}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={row.detailHref}
            className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            詳細
          </Link>
          <Link
            href={row.confirmHref}
            className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
          >
            納品確認
          </Link>
        </div>
      </td>
    </tr>
  );
}
