"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import FinanceReceiptPaidForm from "@/app/components/threeParty/FinanceReceiptPaidForm";
import {
  dashboardKpiBannerTitle,
  matchesDashboardOverdueInvoice,
  matchesDashboardUnpaidInvoice,
  type DashboardKpiSource,
} from "@/lib/dashboard/kpiDrilldown";
import { INVOICE_PAYMENT_STATUSES } from "@/lib/payments/constants";
import type { PaymentBoardRow, PaymentBoardSummary } from "@/lib/payments/loadPaymentBoard";
import { SETTLEMENT_RULE_LIST } from "@/lib/workflow";

type Props = {
  rows: PaymentBoardRow[];
  summary: PaymentBoardSummary;
  initialUnpaid?: boolean;
  initialOverdue?: boolean;
  fromDashboard?: DashboardKpiSource;
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
  fromDashboard,
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
          ((settlementType === "3社間決済" || settlementType === "ローン") &&
            ["3社間決済", "ローン", "三社間決済", "3社間", "三社間"].includes(
              r.settlementType
            ));
        if (!match) return false;
      }
      if (fromDashboard === "overdue") {
        if (!matchesDashboardOverdueInvoice(r)) return false;
      } else if (overdueOnly && r.displayStatus !== "期限超過") {
        return false;
      }
      if (fromDashboard === "unpaid" || fromDashboard === "unpaid-amount") {
        if (!matchesDashboardUnpaidInvoice(r)) return false;
      } else if (
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
    fromDashboard,
    overdueOnly,
    unpaidOnly,
    dueFrom,
    dueTo,
    dealer,
    customer,
    caseNo,
    invoiceNo,
  ]);

  const filteredUnpaidTotal = useMemo(
    () => filtered.reduce((sum, r) => sum + r.unpaidAmount, 0),
    [filtered]
  );

  return (
    <div className="space-y-6">
      {fromDashboard ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="font-medium">{dashboardKpiBannerTitle(fromDashboard)}</p>
          <p className="mt-0.5 text-xs text-sky-800">
            {filtered.length}件 / {formatYen(filteredUnpaidTotal)}
          </p>
          <Link
            href="/payments"
            className="mt-2 inline-block font-medium underline"
          >
            解除
          </Link>
        </div>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="未入金総額"
          value={formatYen(
            fromDashboard === "unpaid" || fromDashboard === "unpaid-amount"
              ? filteredUnpaidTotal
              : summary.unpaidTotal
          )}
        />
        <SummaryCard
          label="今月入金予定額"
          value={formatYen(summary.dueThisMonthTotal)}
        />
        <SummaryCard
          label="期限超過額"
          value={formatYen(
            fromDashboard === "overdue"
              ? filteredUnpaidTotal
              : summary.overdueTotal
          )}
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
                  "入金済 / 実質回収",
                  "未入金残高",
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
                  <PaymentBoardTableRow key={r.invoiceId} row={r} />
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

function PaymentBoardTableRow({ row: r }: { row: PaymentBoardRow }) {
  const router = useRouter();
  const [showFinance, setShowFinance] = useState(false);
  const isThree = r.isThreeParty === true;

  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="whitespace-nowrap px-3 py-3">
          {r.caseId ? (
            <Link
              href={`/cases/${r.caseId}?tab=invoice`}
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
          {isThree ? (
            <span className="ml-1 text-[10px] text-teal-800">信販</span>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          <Link
            href={`/invoices/${r.invoiceId}?from=payments`}
            className="text-gray-900 hover:underline"
          >
            {r.invoiceNo || "—"}
          </Link>
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          {formatYen(r.invoiceAmount)}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          {isThree ? (
            <span title="実質回収額 = 信販入金額 − 販売店支払額">
              {formatYen(r.effectiveRecoveryAmount ?? 0)}
              <span className="block text-[10px] text-gray-400">実質回収</span>
            </span>
          ) : (
            formatYen(r.confirmedPaidAmount)
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          {isThree ? (
            <span title="未入金残高 = 商品請求額 − 実質回収額">
              {formatYen(r.threePartyUnpaidBalance ?? r.unpaidAmount)}
            </span>
          ) : (
            formatYen(r.unpaidAmount)
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          {formatDate(r.dueDate)}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(r.displayStatus)}`}
          >
            {isThree && !r.financePaid
              ? "信販未入金"
              : r.displayStatus}
          </span>
          {!isThree && r.overpaidAmount > 0 ? (
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
          {isThree && r.needsFinanceRegister ? (
            <button
              type="button"
              onClick={() => setShowFinance((v) => !v)}
              className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
            >
              {showFinance ? "閉じる" : "信販入金を登録"}
            </button>
          ) : isThree ? (
            <Link
              href={`/queues/payments-management`}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              支払管理
            </Link>
          ) : (
            <Link
              href={`/invoices/${r.invoiceId}/payments/new`}
              className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
            >
              入金登録
            </Link>
          )}
        </td>
      </tr>
      {isThree && r.needsFinanceRegister && showFinance && r.caseId ? (
        <tr className="border-t border-teal-100 bg-teal-50/40">
          <td colSpan={13} className="px-3 py-3">
            <FinanceReceiptPaidForm
              caseId={r.caseId}
              compact
              onSuccess={() => {
                setShowFinance(false);
                router.refresh();
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
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
