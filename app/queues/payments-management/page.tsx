import PaymentsManagementClient from "./PaymentsManagementClient";
import { loadPaymentsManagementQueue } from "@/lib/queues/loadPaymentsManagementQueue";

export const dynamic = "force-dynamic";

export default async function PaymentsManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const initialTab =
    params.tab === "supplier" ? ("supplier" as const) : ("three_party" as const);
  const { threePartyRows, supplierRows, error } =
    await loadPaymentsManagementQueue();

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          支払管理
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          今すぐ支払う必要があるものだけを処理する作業キューです（KPI・履歴一覧はありません）
        </p>
      </header>

      <main className="p-6 md:p-8">
        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            支払キューの取得に失敗しました：{error}
          </div>
        ) : null}

        <PaymentsManagementClient
          threePartyRows={threePartyRows}
          supplierRows={supplierRows}
          initialTab={initialTab}
        />
      </main>
    </div>
  );
}
