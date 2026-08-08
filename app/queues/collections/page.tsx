import { loadCollectionQueue } from "@/lib/queues/loadCollectionQueue";

import CollectionsQueueClient from "./CollectionsQueueClient";

export const dynamic = "force-dynamic";

export default async function CollectionsQueuePage() {
  const { rows, error } = await loadCollectionQueue();

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          回収管理
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          請求・入金・決済確認など、今日対応が必要な案件を処理します
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
          <CollectionsQueueClient rows={rows} />
        ) : null}
      </main>
    </div>
  );
}
