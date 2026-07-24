"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  CASE_STATUSES,
  getCaseStatusLabel,
  normalizeCaseStatus,
} from "./caseStatus";
import StatusSelect from "./StatusSelect";

export type CasesListItem = {
  id: string;
  caseNo: string;
  createdAt: string | null;
  dealerName: string;
  customerName: string;
  orderType: string;
  status: string | null;
  department: string;
  assignedUser: string;
  desiredDeliveryDate: string | null;
  priority: string;
  salesTotal: number;
  profitTotal: number;
};

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.round(value)) + "円";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

export default function CasesList({ items }: { items: CasesListItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items.filter((item) => {
      const canonical = getCaseStatusLabel(item.status);
      if (statusFilter !== "all" && canonical !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      const haystack = [
        item.caseNo,
        item.dealerName,
        item.customerName,
        item.assignedUser,
        item.department,
        item.orderType,
        canonical,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [items, query, statusFilter]);

  const statusCounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byStatus = new Map<string, number>();

    for (const item of items) {
      if (q) {
        const canonical = getCaseStatusLabel(item.status);
        const haystack = [
          item.caseNo,
          item.dealerName,
          item.customerName,
          item.assignedUser,
          item.department,
          item.orderType,
          canonical,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) {
          continue;
        }
      }

      const label = getCaseStatusLabel(item.status);
      byStatus.set(label, (byStatus.get(label) || 0) + 1);
    }

    return byStatus;
  }, [items, query]);

  const summary = useMemo(() => {
    const sales = filtered.reduce((sum, item) => sum + item.salesTotal, 0);
    const profit = filtered.reduce((sum, item) => sum + item.profitTotal, 0);
    return { sales, profit };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <label className="block min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-400">
              検索
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="案件番号・販売店・顧客・担当者"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm sm:w-52">
            <span className="mb-1 block text-xs font-medium text-gray-400">
              ステータス
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">すべて</option>
              {CASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                  {statusCounts.has(status)
                    ? `（${statusCounts.get(status)}）`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Link
          href="/cases/new"
          className="inline-flex justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          ＋ 案件登録
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="表示件数" value={`${filtered.length}件`} />
        <SummaryCard label="売上合計" value={formatYen(summary.sales)} />
        <SummaryCard label="粗利合計" value={formatYen(summary.profit)} />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-[#f7f7f5] text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">案件番号</th>
                <th className="px-4 py-3 font-medium">登録日</th>
                <th className="px-4 py-3 font-medium">販売店</th>
                <th className="px-4 py-3 font-medium">顧客名</th>
                <th className="px-4 py-3 font-medium">ステータス</th>
                <th className="px-4 py-3 font-medium">担当</th>
                <th className="px-4 py-3 font-medium">希望納期</th>
                <th className="px-4 py-3 font-medium">売上</th>
                <th className="px-4 py-3 font-medium">粗利</th>
                <th className="px-4 py-3 font-medium">優先度</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-[#fafafa]"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/cases/${item.id}`}
                      className="text-gray-900 hover:underline"
                    >
                      {item.caseNo || "—"}
                    </Link>
                    {item.orderType ? (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {item.orderType}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {item.dealerName || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {item.customerName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusSelect
                      caseId={item.id}
                      currentStatus={item.status}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <p>{item.assignedUser || "—"}</p>
                    {item.department ? (
                      <p className="text-xs text-gray-400">
                        {normalizeCaseStatus(item.department) ||
                          item.department}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.desiredDeliveryDate || "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-900">
                    {formatYen(item.salesTotal)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-900">
                    {formatYen(item.profitTotal)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.priority || "中"}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-12 text-center text-sm text-gray-400"
                  >
                    {items.length === 0
                      ? "まだ案件が登録されていません。"
                      : "条件に一致する案件がありません。"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-base font-medium tabular-nums text-gray-900">
        {value}
      </p>
    </div>
  );
}
