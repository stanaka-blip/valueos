"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import FinanceReceiptPaidForm from "@/app/components/threeParty/FinanceReceiptPaidForm";
import type {
  CollectionQueueRow,
  CollectionQueueSummary,
  CollectionUiCategory,
} from "@/lib/queues/collectionQueue";
import { buildCollectionQueueSummary } from "@/lib/queues/collectionQueue";

type FilterKey = "all" | CollectionUiCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "invoice_pending", label: "請求待ち" },
  { key: "payment_waiting", label: "入金待ち" },
  { key: "partial_payment", label: "一部入金" },
  { key: "overdue", label: "期限超過" },
  { key: "settlement_review", label: "決済・審査待ち" },
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function formatYen(value: number | null | undefined): string {
  if (value == null) return "—";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatCountYen(count: number, remaining: number | null): string {
  if (remaining == null) return `${count}件`;
  return `${count}件 / 残額 ${formatYen(remaining)}`;
}

export default function CollectionsQueueClient({
  rows,
}: {
  rows: CollectionQueueRow[];
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const summary = buildCollectionQueueSummary(rows);
  const visibleRows =
    filter === "all" ? rows : rows.filter((row) => row.uiCategory === filter);

  return (
    <div className="space-y-6">
      <SummaryStrip summary={summary} />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={
                active
                  ? "rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {visibleRows.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          該当する回収対応待ちの案件はありません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-[#f7f7f5] text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">状態</th>
                <th className="px-4 py-3 whitespace-nowrap">案件番号</th>
                <th className="px-4 py-3 whitespace-nowrap">顧客名</th>
                <th className="px-4 py-3 whitespace-nowrap">販売店</th>
                <th className="px-4 py-3 whitespace-nowrap">決済条件</th>
                <th className="px-4 py-3 whitespace-nowrap">請求額</th>
                <th className="px-4 py-3 whitespace-nowrap">入金済額</th>
                <th className="px-4 py-3 whitespace-nowrap">残額</th>
                <th className="px-4 py-3 whitespace-nowrap">支払期限</th>
                <th className="px-4 py-3 whitespace-nowrap">次の対応</th>
                <th className="px-4 py-3 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <CollectionQueueTableRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryStrip({ summary }: { summary: CollectionQueueSummary }) {
  const items = [
    {
      key: "invoice_pending",
      label: "請求待ち",
      value: `${summary.invoicePendingCount}件`,
      emphasize: false,
    },
    {
      key: "payment_waiting",
      label: "入金待ち",
      value: formatCountYen(
        summary.paymentWaitingCount,
        summary.paymentWaitingRemaining
      ),
      emphasize: false,
    },
    {
      key: "partial_payment",
      label: "一部入金",
      value: formatCountYen(
        summary.partialPaymentCount,
        summary.partialPaymentRemaining
      ),
      emphasize: false,
    },
    {
      key: "overdue",
      label: "期限超過",
      value: formatCountYen(summary.overdueCount, summary.overdueRemaining),
      emphasize: true,
    },
    {
      key: "settlement_review",
      label: "決済・審査待ち",
      value: `${summary.settlementReviewCount}件`,
      emphasize: false,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.key}
          className={
            item.emphasize
              ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3"
              : "rounded-xl border border-gray-200 bg-white px-4 py-3"
          }
        >
          <p
            className={
              item.emphasize
                ? "text-xs font-medium text-red-700"
                : "text-xs font-medium text-gray-500"
            }
          >
            {item.label}
          </p>
          <p
            className={
              item.emphasize
                ? "mt-1 text-sm font-semibold text-red-800"
                : "mt-1 text-sm font-semibold text-gray-900"
            }
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function CollectionQueueTableRow({ row }: { row: CollectionQueueRow }) {
  const router = useRouter();
  const [showFinanceForm, setShowFinanceForm] = useState(false);
  const overdue = row.uiCategory === "overdue" || row.isOverdue;
  const remainingEmphasis =
    row.uiCategory === "partial_payment" || row.uiCategory === "overdue";
  const ctaLabel = row.ctaLabel || row.secondaryLabel;

  return (
    <>
      <tr
        className={
          row.uiCategory === "overdue"
            ? "border-b border-red-100 bg-red-50/40 last:border-0"
            : "border-b border-gray-100 last:border-0"
        }
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className={
              row.uiCategory === "overdue"
                ? "font-medium text-red-700"
                : "text-gray-900"
            }
          >
            {row.displayStateLabel}
          </span>
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
          {row.settlementType}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
          {formatYen(row.invoiceAmount)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
          {formatYen(row.confirmedPaidAmount)}
        </td>
        <td
          className={
            remainingEmphasis
              ? "px-4 py-3 whitespace-nowrap font-semibold text-red-700"
              : "px-4 py-3 whitespace-nowrap text-gray-700"
          }
        >
          {formatYen(row.remainingAmount)}
        </td>
        <td
          className={
            overdue
              ? "px-4 py-3 whitespace-nowrap font-medium text-red-700"
              : "px-4 py-3 whitespace-nowrap text-gray-700"
          }
        >
          {formatDate(row.dueDate)}
        </td>
        <td className="px-4 py-3 text-gray-700">{row.nextAction}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={row.detailHref}
              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              詳細
            </Link>
            {row.allowsFinanceRegister ? (
              <button
                type="button"
                onClick={() => setShowFinanceForm((v) => !v)}
                className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
              >
                {showFinanceForm ? "閉じる" : "信販入金を登録"}
              </button>
            ) : row.secondaryHref && ctaLabel ? (
              <Link
                href={row.secondaryHref}
                className={
                  row.uiCategory === "overdue"
                    ? "rounded-md bg-red-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                    : "rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                }
              >
                {ctaLabel}
              </Link>
            ) : null}
          </div>
        </td>
      </tr>
      {row.allowsFinanceRegister && showFinanceForm ? (
        <tr className="border-b border-gray-100 bg-teal-50/30">
          <td colSpan={11} className="px-4 py-3">
            <FinanceReceiptPaidForm
              caseId={row.id}
              compact
              onSuccess={() => {
                setShowFinanceForm(false);
                router.refresh();
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
