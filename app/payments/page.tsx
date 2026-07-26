import Link from "next/link";

import { loadPaymentBoard } from "@/lib/payments/loadPaymentBoard";

import PaymentsBoardClient from "./PaymentsBoardClient";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const board = await loadPaymentBoard();

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200 bg-white px-6 py-5 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">入金管理</h1>
            <p className="mt-1 text-sm text-gray-500">
              請求単位の入金状況・遅延・次アクション
            </p>
          </div>
          <Link
            href="/invoices"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            請求一覧へ
          </Link>
        </div>
      </header>

      <main className="p-6 md:p-8">
        {board.error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            入金データの取得に失敗しました：{board.error}
          </div>
        ) : null}
        <PaymentsBoardClient rows={board.rows} summary={board.summary} />
      </main>
    </div>
  );
}
