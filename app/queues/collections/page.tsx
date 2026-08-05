import Link from "next/link";

import { loadCollectionQueue } from "@/lib/queues/loadCollectionQueue";
import type { CollectionQueueRow } from "@/lib/queues/collectionQueue";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function formatYen(value: number | null, label: string | null): string {
  if (value == null) return "—";
  const amount = `${Math.round(value).toLocaleString("ja-JP")}円`;
  return label ? `${label} ${amount}` : amount;
}

export default async function CollectionsQueuePage() {
  const { rows, error } = await loadCollectionQueue();

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          回収管理
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          決済条件ごとに、請求・入金・決済確認などお金の対応が残っている案件を表示します
        </p>
      </header>

      <main className="p-6 md:p-8">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            回収キューの取得に失敗しました：{error}
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            現在、回収対応待ちの案件はありません。
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-[#f7f7f5] text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">案件番号</th>
                  <th className="px-4 py-3 whitespace-nowrap">顧客名</th>
                  <th className="px-4 py-3 whitespace-nowrap">販売店</th>
                  <th className="px-4 py-3 whitespace-nowrap">決済条件</th>
                  <th className="px-4 py-3 whitespace-nowrap">金額</th>
                  <th className="px-4 py-3 whitespace-nowrap">状態</th>
                  <th className="px-4 py-3 whitespace-nowrap">次の対応</th>
                  <th className="px-4 py-3 whitespace-nowrap">期限</th>
                  <th className="px-4 py-3 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CollectionQueueTableRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function CollectionQueueTableRow({ row }: { row: CollectionQueueRow }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
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
        {row.settlementType}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
        {formatYen(row.amount, row.amountLabel)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
        {row.stateLabel}
      </td>
      <td className="px-4 py-3 text-gray-700">{row.nextAction}</td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
        {formatDate(row.dueDate)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={row.detailHref}
            className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            詳細
          </Link>
          {row.secondaryHref && row.secondaryLabel ? (
            <Link
              href={row.secondaryHref}
              className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
            >
              {row.secondaryLabel}
            </Link>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
