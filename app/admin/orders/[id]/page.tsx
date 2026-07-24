import Link from "next/link";

type AdminOrderDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminOrderDetailPage({
  params,
}: AdminOrderDetailPageProps) {
  const { id } = await params;

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-xl font-bold text-gray-900">受注詳細</h1>
        <p className="mt-1 text-sm text-gray-500">
          詳細画面は今後実装予定です
        </p>
      </header>

      <div className="p-4 md:p-8">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-700">
            案件ID：
            <span className="ml-2 font-mono font-bold text-gray-900">
              {id}
            </span>
          </p>
          <p className="mt-3 text-sm text-gray-500">
            このページはプレースホルダーです。受注詳細は未実装です。
          </p>

          <div className="mt-6">
            <Link
              href="/admin/orders"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              受注一覧へ戻る
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
