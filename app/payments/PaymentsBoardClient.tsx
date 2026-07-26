"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { INVOICE_PAYMENT_STATUSES } from "@/lib/payments/constants";
import type { PaymentBoardRow, PaymentBoardSummary } from "@/lib/payments/loadPaymentBoard";
import { SETTLEMENT_RULE_LIST } from "@/lib/workflow";

type Props = {
  rows: PaymentBoardRow[];
  summary: PaymentBoardSummary;
  initialUnpaid?: boolean;
  initialOverdue?: boolean;
};

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.round(value)) + "円";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return value;
}

function statusClass(status: string): string {
  switch (status) {
    case "入金済":
      return "bg-emerald-100 text-emerald-800";
    case "一部入金":
      return "bg-sky-100 text-sky-800";
    case "期限超過":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function PaymentsBoardClient({
  rows,
  summary,
  initialUnpaid = false,
  initialOverdue = false,
}: Props) {
  const [status, setStatus] = useState("");
  const [settlementType, setSettlementType] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(initialUnpaid);
  const [overdueOnly, setOverdueOnly] = useState(initialOverdue);
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [dealer, setDealer] = useState("");
  const [customer, setCustomer] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");

  const dealerOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.dealerName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ja")
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status && r.displayStatus !== status) return false;
      if (settlementType) {
        const match =
          r.settlementType === settlementType ||
          r.settlementTypeLabel === settlementType ||
          (settlementType === "売掛" &&
            (r.settlementType === "掛売" || r.settlementType === "売掛")) ||
          (settlementType === "ローン" &&
            ["ローン", "三社間決済", "3社間", "三社間"].includes(
              r.settlementType
            ));
        if (!match) return false;
      }
      if (overdueOnly && r.displayStatus !== "期限超過") return false;
      if (
        unpaidOnly &&
        !(
          r.displayStatus === "未入金" ||
          r.displayStatus === "一部入金" ||
          r.displayStatus === "期限超過"
        )
      ) {
        return false;
      }
      if (dueFrom && (!r.dueDate || r.dueDate < dueFrom)) return false;
      if (dueTo && (!r.dueDate || r.dueDate > dueTo)) return false;
      if (dealer && r.dealerName !== dealer) return false;
      if (customer && !r.customerName.includes(customer.trim())) return false;
      if (caseNo && !r.caseNo.includes(caseNo.trim())) return false;
      if (invoiceNo && !r.invoiceNo.includes(invoiceNo.trim())) return false;
      return true;
    });
  }, [
    rows,
    status,
    settlementType,
    overdueOnly,
    unpaidOnly,
    dueFrom,
    dueTo,
    dealer,
    customer,
    caseNo,
    invoiceNo,
  ]);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="未入金総額" value={formatYen(summary.unpaidTotal)} />
        <SummaryCard
          label="今月入金予定額"
          value={formatYen(summary.dueThisMonthTotal)}
        />
        <SummaryCard
          label="期限超過額"
          value={formatYen(summary.overdueTotal)}
          alert
        />
        <SummaryCard
          label="今月入金済額"
          value={formatYen(summary.paidThisMonthTotal)}
        />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <FilterSelect
            label="入金状況"
            value={status}
            onChange={setStatus}
            options={INVOICE_PAYMENT_STATUSES.map((s) => ({
              value: s,
              label: s,
            }))}
          />
          <FilterSelect
            label="決済区分"
            value={settlementType}
            onChange={setSettlementType}
            options={SETTLEMENT_RULE_LIST.map((r) => ({
              value: r.key,
              label: r.label,
            }))}
          />
          <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            遅延のみ
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={unpaidOnly}
              onChange={(e) => setUnpaidOnly(e.target.checked)}
            />
            未入金のみ
          </label>
          <FilterSelect
            label="販売店"
            value={dealer}
            onChange={setDealer}
            options={dealerOptions.map((d) => ({ value: d, label: d }))}
          />
          <FilterInput
            label="入金予定日（From）"
            type="date"
            value={dueFrom}
            onChange={setDueFrom}
          />
          <FilterInput
            label="入金予定日（To）"
            type="date"
            value={dueTo}
            onChange={setDueTo}
          />
          <FilterInput
            label="顧客名"
            value={customer}
            onChange={setCustomer}
            placeholder="部分一致"
          />
          <FilterInput
            label="案件番号"
            value={caseNo}
            onChange={setCaseNo}
            placeholder="部分一致"
          />
          <FilterInput
            label="請求番号"
            value={invoiceNo}
            onChange={setInvoiceNo}
            placeholder="部分一致"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f7f7f5] text-xs font-medium text-gray-500">
              <tr>
                {[
                  "案件番号",
                  "顧客名",
                  "販売店",
                  "決済区分",
                  "請求番号",
                  "請求金額",
                  "入金済金額",
                  "未入金金額",
                  "入金予定日",
                  "入金状況",
                  "遅延日数",
                  "次アクション",
                  "",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-3 py-10 text-center text-gray-500"
                  >
                    該当する請求がありません
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.invoiceId} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-3">
                      {r.caseId ? (
                        <Link
                          href={`/cases/${r.caseId}`}
                          className="text-gray-900 hover:underline"
                        >
                          {r.caseNo || "—"}
                        </Link>
                      ) : (
                        r.caseNo || "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {r.customerName || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {r.dealerName || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {r.settlementTypeLabel || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Link
                        href={`/invoices/${r.invoiceId}`}
                        className="text-gray-900 hover:underline"
                      >
                        {r.invoiceNo || "—"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatYen(r.invoiceAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatYen(r.confirmedPaidAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatYen(r.unpaidAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDate(r.dueDate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(r.displayStatus)}`}
                      >
                        {r.displayStatus}
                      </span>
                      {r.overpaidAmount > 0 ? (
                        <span className="ml-1 text-xs text-amber-700">過入金</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {r.delayDays > 0 ? `${r.delayDays}日` : "—"}
                    </td>
                    <td className="min-w-[10rem] px-3 py-3 text-xs text-gray-600">
                      {r.nextAction}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Link
                        href={`/invoices/${r.invoiceId}/payments/new`}
                        className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                      >
                        入金登録
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
          {filtered.length} / {rows.length} 件
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p
        className={`mt-2 text-xl font-semibold ${
          alert ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">すべて</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}
