"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  DealerSettlementView,
  FinanceReceiptView,
  SupplierPaymentView,
  ThreePartyMoneyView,
} from "@/lib/threeParty/loadThreePartyMoneyAdmin";
import { calculateDealerSettlementPayout } from "@/lib/threeParty/dealerSettlementCalc";

import { submitThreePartyMoney } from "./submitThreePartyMoney";

function formatYen(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.floor(value).toLocaleString("ja-JP")}円`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value;
}

function StatusBadge({ label }: { label: string }) {
  const tone =
    label === "取消"
      ? "bg-gray-100 text-gray-600"
      : label === "期限超過"
        ? "bg-rose-50 text-rose-700"
        : label === "入金済" || label === "支払済"
          ? "bg-emerald-50 text-emerald-800"
          : label === "入金予定" || label === "支払予定"
            ? "bg-amber-50 text-amber-900"
            : label === "下書き" || label === "未入金"
              ? "bg-slate-100 text-slate-700"
              : "bg-amber-50 text-amber-900";
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

type Props = {
  caseId: string;
  dealerId: string | null;
  financeCompanyDefault: string;
  invoices: Array<{ id: string; invoiceNo: string; invoiceAmount: number; status: string }>;
  orders: Array<{
    id: string;
    orderNo: string;
    supplierId: string | null;
    supplierName: string;
    orderAmount: number;
    status: string;
  }>;
  money: ThreePartyMoneyView;
  /** settlement | payment | invoice */
  section: "finance" | "dealer" | "supplier";
  /**
   * case_flow: 案件詳細向けに簡素化（支払済操作は支払管理へ誘導）
   * full: 履歴・訂正・支払まで同一画面（互換）
   */
  variant?: "case_flow" | "full";
};

export default function ThreePartyMoneyPanels(props: Props) {
  const variant = props.variant || "full";
  if (props.section === "finance") {
    return <FinanceReceiptPanel {...props} variant={variant} />;
  }
  if (props.section === "dealer") {
    return <DealerSettlementPanel {...props} variant={variant} />;
  }
  return <SupplierPaymentPanel {...props} variant={variant} />;
}

function FinanceReceiptPanel({
  caseId,
  financeCompanyDefault,
  money,
  variant = "full",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const caseFlow = variant === "case_flow";
  const hasActiveReceipt = money.financeReceipts.some(
    (r) => r.status !== "取消"
  );
  const [showCreateForm, setShowCreateForm] = useState(!hasActiveReceipt);
  const [form, setForm] = useState({
    finance_company: financeCompanyDefault || "",
    scheduled_date: "",
    scheduled_amount: "",
    memo: "",
  });

  async function run(
    action: string,
    resourceId: string | undefined,
    body: Record<string, unknown>
  ) {
    setBusy(true);
    setError("");
    const result = await submitThreePartyMoney({
      action,
      caseId,
      resourceId,
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error_message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-4 border-t border-gray-100 pt-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">① 信販会社からの入金</h3>
        <p className="mt-1 text-xs text-gray-500">
          信販会社→Value Ecology の入金イベントです。仕切清算・仕入先支払の前提条件ではありません。
        </p>
      </div>
      {money.loadError ? (
        <p className="text-sm text-rose-700">{money.loadError}</p>
      ) : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="space-y-3">
        {money.financeReceipts.length === 0 ? (
          <p className="text-sm text-gray-500">信販入金はまだありません。</p>
        ) : (
          money.financeReceipts.map((row) => (
            <FinanceReceiptCard
              key={row.id}
              row={row}
              busy={busy}
              onConfirm={(actual_date, actual_amount) =>
                run("finance_receipt.confirm", row.id, {
                  actual_date,
                  actual_amount,
                })
              }
              onCancel={() =>
                run("finance_receipt.cancel", row.id, {
                  cancel_reason: "画面から取消",
                })
              }
              onCorrect={(body) =>
                run("finance_receipt.correct", row.id, {
                  ...body,
                  cancel_reason: "画面から訂正",
                })
              }
            />
          ))
        )}
      </div>

      {caseFlow && hasActiveReceipt && !showCreateForm ? (
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => setShowCreateForm(true)}
        >
          信販入金の予定を追加登録
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-600">予定登録</p>
            {caseFlow && hasActiveReceipt ? (
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => setShowCreateForm(false)}
              >
                閉じる
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              信販会社
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.finance_company}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, finance_company: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              予定入金日
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.scheduled_date}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scheduled_date: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              予定金額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.scheduled_amount}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scheduled_amount: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              備考
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.memo}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, memo: e.target.value }))
                }
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={() =>
              run("finance_receipt.create", undefined, {
                finance_company: form.finance_company,
                scheduled_date: form.scheduled_date || null,
                scheduled_amount: Number(form.scheduled_amount),
                memo: form.memo || null,
              })
            }
          >
            予定を登録
          </button>
        </div>
      )}
    </div>
  );
}

function FinanceReceiptCard({
  row,
  busy,
  onConfirm,
  onCancel,
  onCorrect,
}: {
  row: FinanceReceiptView;
  busy: boolean;
  onConfirm: (date: string, amount: number) => void;
  onCancel: () => void;
  onCorrect: (body: Record<string, unknown>) => void;
}) {
  const [actualDate, setActualDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [actualAmount, setActualAmount] = useState(String(row.scheduledAmount));
  const [correcting, setCorrecting] = useState(false);
  const [correctForm, setCorrectForm] = useState({
    finance_company: row.financeCompany,
    scheduled_date: row.scheduledDate || "",
    scheduled_amount: String(row.scheduledAmount),
    memo: row.memo || "",
  });
  const active = row.status !== "取消";

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-gray-400">信販会社</p>
          <p className="text-sm font-semibold text-gray-900">{row.financeCompany}</p>
        </div>
        <StatusBadge label={row.displayStatus} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
        <div>
          <p className="text-xs text-gray-400">予定入金日</p>
          <p>{formatDate(row.scheduledDate)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">予定金額</p>
          <p>{formatYen(row.scheduledAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">実入金日</p>
          <p>{formatDate(row.actualDate)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">実入金額</p>
          <p>{formatYen(row.actualAmount)}</p>
        </div>
      </div>
      {row.memo ? <p className="mt-2 text-xs text-gray-500">備考: {row.memo}</p> : null}

      {active && row.status === "予定" ? (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-medium text-gray-700">
            入金確認: 実入金日・実入金額を入力して確定します
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-600">
              実入金日
              <input
                type="date"
                className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={actualDate}
                disabled={busy}
                onChange={(e) => setActualDate(e.target.value)}
              />
            </label>
            <label className="text-xs text-gray-600">
              実入金額
              <input
                type="number"
                min={0}
                className="mt-1 block w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={actualAmount}
                disabled={busy}
                onChange={(e) => setActualAmount(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              onClick={() => onConfirm(actualDate, Number(actualAmount))}
            >
              入金確認
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50"
              onClick={() => setCorrecting((v) => !v)}
            >
              訂正
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
              onClick={onCancel}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {active && row.status === "入金済" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <p className="w-full text-xs text-gray-500">
            入金済金額の直接編集はできません。変更は訂正（元行取消＋新規作成）で行います。
          </p>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50"
            onClick={() => setCorrecting((v) => !v)}
          >
            訂正
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      ) : null}

      {active && correcting ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-900">
            訂正内容（元レコードは取消され、新しい予定が作成されます）
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              信販会社
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.finance_company}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({ ...f, finance_company: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              予定入金日
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.scheduled_date}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({ ...f, scheduled_date: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              予定金額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.scheduled_amount}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({
                    ...f,
                    scheduled_amount: e.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              備考
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.memo}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({ ...f, memo: e.target.value }))
                }
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            onClick={() =>
              onCorrect({
                finance_company: correctForm.finance_company,
                scheduled_date: correctForm.scheduled_date || null,
                scheduled_amount: Number(correctForm.scheduled_amount),
                memo: correctForm.memo || null,
              })
            }
          >
            訂正を実行
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DealerSettlementPanel({
  caseId,
  dealerId,
  invoices,
  money,
  variant = "full",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const caseFlow = variant === "case_flow";
  const activeReceipt = money.financeReceipts.find((r) => r.status === "入金済")
    || money.financeReceipts.find((r) => r.status === "予定");
  const activeInvoice = invoices.find((i) => i.status !== "取消");
  const hasUnpaidSettlement = money.dealerSettlements.some(
    (s) => s.status !== "取消" && s.status !== "支払済"
  );
  const [showCreateForm, setShowCreateForm] = useState(!hasUnpaidSettlement);

  const [form, setForm] = useState({
    credit_received_amount: String(activeReceipt?.actualAmount ?? activeReceipt?.scheduledAmount ?? ""),
    ve_share_amount: String(activeInvoice?.invoiceAmount ?? ""),
    transfer_fee: "550",
    scheduled_payout_date: "",
    memo: "",
    finance_receipt_id: activeReceipt?.id || "",
    invoice_id: activeInvoice?.id || "",
  });

  const preview = calculateDealerSettlementPayout({
    creditReceivedAmount: Number(form.credit_received_amount) || 0,
    veShareAmount: Number(form.ve_share_amount) || 0,
    adjustmentLines: [
      { line_kind: "transfer_fee", amount: Number(form.transfer_fee) || 0 },
    ],
  });

  async function run(
    action: string,
    resourceId: string | undefined,
    body: Record<string, unknown>
  ) {
    setBusy(true);
    setError("");
    const result = await submitThreePartyMoney({
      action,
      caseId,
      resourceId,
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error_message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-4 border-t border-gray-100 pt-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          {caseFlow ? "② 金額確認・仕切作成 → ③ 確定" : "② 販売店への仕切清算・支払"}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {caseFlow
            ? "案件詳細では金額確定まで。販売店への実支払は支払管理で処理します。"
            : "操作: 下書き作成 → 確定（金額固定）→ 支払済。確定後の金額直接編集は不可。変更は訂正。信販入金の完了は必須ではありません。"}
        </p>
      </div>
      {caseFlow ? (
        <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
          <p className="font-semibold">④ 支払は支払管理へ</p>
          <p className="mt-1 text-sky-900/90">
            信販入金済かつ販売店未払いの案件は、支払管理の「3社間支払い」に自動で並びます。
          </p>
          <Link
            href="/queues/payments-management"
            className="mt-2 inline-flex text-xs font-medium text-sky-900 underline"
          >
            支払管理を開く
          </Link>
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="space-y-3">
        {money.dealerSettlements.length === 0 ? (
          <p className="text-sm text-gray-500">仕切清算はまだありません。</p>
        ) : (
          money.dealerSettlements.map((row) => (
            <DealerSettlementCard
              key={row.id}
              row={row}
              dealerId={dealerId}
              busy={busy}
              hidePay={caseFlow}
              onConfirm={() => run("dealer_settlement.confirm", row.id, {})}
              onPay={(date, amount) =>
                run("dealer_settlement.pay", row.id, {
                  actual_payout_date: date,
                  actual_payout_amount: amount,
                })
              }
              onCancel={() =>
                run("dealer_settlement.cancel", row.id, {
                  cancel_reason: "画面から取消",
                })
              }
              onCorrect={(body) => {
                if (!dealerId) {
                  setError("販売店が未設定のため訂正できません");
                  return;
                }
                return run("dealer_settlement.correct", row.id, {
                  ...body,
                  dealer_id: dealerId,
                  finance_receipt_id: row.financeReceiptId,
                  invoice_id: row.invoiceId,
                  cancel_reason: "画面から訂正",
                });
              }}
            />
          ))
        )}
      </div>

      {dealerId ? (
        caseFlow && hasUnpaidSettlement && !showCreateForm ? (
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => setShowCreateForm(true)}
          >
            仕切を追加作成
          </button>
        ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-600">仕切作成（下書き）</p>
            {caseFlow && hasUnpaidSettlement ? (
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => setShowCreateForm(false)}
              >
                閉じる
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              信販会社からの入金額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.credit_received_amount}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, credit_received_amount: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              Value Ecology売上 / 請求額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.ve_share_amount}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ve_share_amount: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              振込手数料
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.transfer_fee}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, transfer_fee: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              支払予定日
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.scheduled_payout_date}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scheduled_payout_date: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 text-sm">
            <div className="flex justify-between border-b border-gray-100 px-3 py-2">
              <span>信販会社からの入金額</span>
              <span className="tabular-nums">{formatYen(Number(form.credit_received_amount) || 0)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 px-3 py-2 text-gray-700">
              <span>− Value Ecology売上 / 請求額</span>
              <span className="tabular-nums">{formatYen(Number(form.ve_share_amount) || 0)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 px-3 py-2 text-gray-700">
              <span>− 振込手数料</span>
              <span className="tabular-nums">{formatYen(Number(form.transfer_fee) || 0)}</span>
            </div>
            <div className="flex justify-between bg-gray-900 px-3 py-3 font-semibold text-white">
              <span>＝ 販売店への御振込金額</span>
              <span className="text-base tabular-nums">{formatYen(preview.payoutAmount)}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={() =>
              run("dealer_settlement.create", undefined, {
                dealer_id: dealerId,
                finance_receipt_id: form.finance_receipt_id || null,
                invoice_id: form.invoice_id || null,
                credit_received_amount: Number(form.credit_received_amount),
                ve_share_amount: Number(form.ve_share_amount),
                scheduled_payout_date: form.scheduled_payout_date || null,
                issue_date: new Date().toISOString().slice(0, 10),
                memo: form.memo || null,
                lines: [
                  {
                    line_kind: "credit_in",
                    description: "クレジット会社入金額",
                    amount: Number(form.credit_received_amount) || 0,
                    sort_order: 1,
                  },
                  {
                    line_kind: "ve_share",
                    description: "弊社売上金額",
                    amount: Number(form.ve_share_amount) || 0,
                    sort_order: 2,
                  },
                  {
                    line_kind: "transfer_fee",
                    description: "振込手数料",
                    amount: Number(form.transfer_fee) || 0,
                    sort_order: 3,
                  },
                ],
              })
            }
          >
            仕切を作成
          </button>
        </div>
        )
      ) : (
        <p className="text-sm text-amber-800">
          販売店が未設定のため仕切を作成できません。
        </p>
      )}
    </div>
  );
}

function DealerSettlementCard({
  row,
  dealerId,
  busy,
  hidePay = false,
  onConfirm,
  onPay,
  onCancel,
  onCorrect,
}: {
  row: DealerSettlementView;
  dealerId: string | null;
  busy: boolean;
  hidePay?: boolean;
  onConfirm: () => void;
  onPay: (date: string, amount: number) => void;
  onCancel: () => void;
  onCorrect: (body: Record<string, unknown>) => void;
}) {
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState(String(row.payoutAmount));
  const [correcting, setCorrecting] = useState(false);
  const feeLine = row.lines.find((l) => l.lineKind === "transfer_fee");
  const otherAdj = row.lines.filter((l) =>
    ["discount", "offset", "other"].includes(l.lineKind)
  );
  const [correctForm, setCorrectForm] = useState({
    credit_received_amount: String(row.creditReceivedAmount),
    ve_share_amount: String(row.veShareAmount),
    transfer_fee: String(feeLine?.amount ?? row.adjustmentTotalAmount),
    scheduled_payout_date: row.scheduledPayoutDate || "",
    memo: row.memo || "",
  });
  const correctPreview = calculateDealerSettlementPayout({
    creditReceivedAmount: Number(correctForm.credit_received_amount) || 0,
    veShareAmount: Number(correctForm.ve_share_amount) || 0,
    adjustmentLines: [
      { line_kind: "transfer_fee", amount: Number(correctForm.transfer_fee) || 0 },
      ...otherAdj.map((l) => ({ line_kind: l.lineKind, amount: l.amount })),
    ],
  });
  const active = row.status !== "取消";
  const amountsLocked = row.status === "確定" || row.status === "支払済";

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">
          状態フロー: 下書き → 確定 → 支払済
        </p>
        <StatusBadge label={row.displayStatus} />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 text-sm">
        <div className="flex justify-between border-b border-gray-100 px-3 py-2">
          <span>信販会社からの入金額</span>
          <span className="tabular-nums">{formatYen(row.creditReceivedAmount)}</span>
        </div>
        <div className="flex justify-between border-b border-gray-100 px-3 py-2 text-gray-700">
          <span>− Value Ecology売上 / 請求額</span>
          <span className="tabular-nums">{formatYen(row.veShareAmount)}</span>
        </div>
        <div className="flex justify-between border-b border-gray-100 px-3 py-2 text-gray-700">
          <span>− 振込手数料</span>
          <span className="tabular-nums">
            {formatYen(feeLine?.amount ?? 0)}
          </span>
        </div>
        {otherAdj.map((l) => (
          <div
            key={l.id}
            className="flex justify-between border-b border-gray-100 px-3 py-2 text-gray-700"
          >
            <span>− {l.description || l.lineKind}</span>
            <span className="tabular-nums">{formatYen(l.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between bg-gray-900 px-3 py-3 font-semibold text-white">
          <span>＝ 販売店への御振込金額</span>
          <span className="text-base tabular-nums">{formatYen(row.payoutAmount)}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
        <div>
          <p className="text-xs text-gray-400">支払予定日</p>
          <p>{formatDate(row.scheduledPayoutDate)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">実支払日</p>
          <p>{formatDate(row.actualPayoutDate)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">実支払額</p>
          <p>{formatYen(row.actualPayoutAmount)}</p>
        </div>
      </div>
      {row.memo ? <p className="mt-2 text-xs text-gray-500">備考: {row.memo}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {row.invoiceId ? (
          <Link
            href={`/invoices/${row.invoiceId}`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700"
          >
            請求書を開く
          </Link>
        ) : null}
        <Link
          href={`/dealer-settlements/${row.id}/print`}
          target="_blank"
          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700"
        >
          仕切清算書を開く
        </Link>
        {active && row.status === "下書き" ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            onClick={onConfirm}
          >
            確定（金額を固定）
          </button>
        ) : null}
        {active && row.status === "確定" ? (
          hidePay ? (
            <Link
              href="/queues/payments-management"
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white"
            >
              支払管理で支払処理
            </Link>
          ) : (
            <>
              <label className="text-xs text-gray-600">
                実支払日
                <input
                  type="date"
                  className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  value={payDate}
                  disabled={busy}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </label>
              <label className="text-xs text-gray-600">
                実支払額
                <input
                  type="number"
                  min={0}
                  className="mt-1 block w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  value={payAmount}
                  disabled={busy}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                onClick={() => onPay(payDate, Number(payAmount))}
              >
                支払済にする
              </button>
            </>
          )
        ) : null}
        {active ? (
          <>
            <button
              type="button"
              disabled={busy || !dealerId}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50"
              onClick={() => setCorrecting((v) => !v)}
            >
              訂正
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
              onClick={onCancel}
            >
              取消
            </button>
          </>
        ) : null}
      </div>

      {amountsLocked ? (
        <p className="mt-2 text-xs text-gray-500">
          確定済みの仕切金額は直接編集できません。変更は訂正フローを使ってください。
        </p>
      ) : null}

      {active && correcting ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-900">
            訂正内容（元レコード取消 + 新しい下書き作成）
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              信販入金額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.credit_received_amount}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({
                    ...f,
                    credit_received_amount: e.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              VE売上 / 請求額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.ve_share_amount}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({
                    ...f,
                    ve_share_amount: e.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              振込手数料
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.transfer_fee}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({ ...f, transfer_fee: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              支払予定日
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.scheduled_payout_date}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({
                    ...f,
                    scheduled_payout_date: e.target.value,
                  }))
                }
              />
            </label>
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            御振込（見込）: {formatYen(correctPreview.payoutAmount)}
          </p>
          <button
            type="button"
            disabled={busy || !dealerId}
            className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            onClick={() =>
              onCorrect({
                credit_received_amount: Number(correctForm.credit_received_amount),
                ve_share_amount: Number(correctForm.ve_share_amount),
                scheduled_payout_date: correctForm.scheduled_payout_date || null,
                memo: correctForm.memo || null,
                lines: [
                  {
                    line_kind: "credit_in",
                    description: "クレジット会社入金額",
                    amount: Number(correctForm.credit_received_amount) || 0,
                    sort_order: 1,
                  },
                  {
                    line_kind: "ve_share",
                    description: "弊社売上金額",
                    amount: Number(correctForm.ve_share_amount) || 0,
                    sort_order: 2,
                  },
                  {
                    line_kind: "transfer_fee",
                    description: "振込手数料",
                    amount: Number(correctForm.transfer_fee) || 0,
                    sort_order: 3,
                  },
                  ...otherAdj.map((l, i) => ({
                    line_kind: l.lineKind,
                    description: l.description,
                    amount: l.amount,
                    memo: l.memo,
                    sort_order: 4 + i,
                  })),
                ],
              })
            }
          >
            訂正を実行
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SupplierPaymentPanel({
  caseId,
  orders,
  money,
  variant = "full",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const caseFlow = variant === "case_flow";
  const activeOrders = orders.filter(
    (o) => o.status !== "キャンセル" && o.status !== "取消"
  );
  const [selectedOrderId, setSelectedOrderId] = useState(activeOrders[0]?.id || "");
  const selected = activeOrders.find((o) => o.id === selectedOrderId);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState(String(selected?.orderAmount ?? ""));

  async function run(
    action: string,
    resourceId: string | undefined,
    body: Record<string, unknown>
  ) {
    setBusy(true);
    setError("");
    const result = await submitThreePartyMoney({
      action,
      caseId,
      resourceId,
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error_message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">③ 仕入先への支払</h3>
        <p className="mt-1 text-xs text-gray-500">
          {caseFlow
            ? "納品済みかつ未払いの発注は支払管理に自動表示されます。ここは履歴・例外操作用です。"
            : "発注に対する支払イベントです（同一発注に複数登録可。当面は1回払いUI）。信販入金の有無は問いません。"}
        </p>
      </div>
      {caseFlow ? (
        <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
          <p className="font-semibold">支払待ちは支払管理で処理</p>
          <Link
            href="/queues/payments-management"
            className="mt-2 inline-flex text-xs font-medium text-sky-900 underline"
          >
            支払管理（仕入先支払い）を開く
          </Link>
        </div>
      ) : null}
      {money.loadError ? (
        <p className="text-sm text-rose-700">{money.loadError}</p>
      ) : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="space-y-3">
        {money.supplierPayments.length === 0 ? (
          <p className="text-sm text-gray-500">仕入先支払はまだありません。</p>
        ) : (
          money.supplierPayments.map((row) => (
            <SupplierPaymentCard
              key={row.id}
              row={row}
              busy={busy}
              hidePay={caseFlow}
              onPay={(date, paid) =>
                run("supplier_payment.pay", row.id, {
                  paid_date: date,
                  paid_amount: paid,
                })
              }
              onCancel={() =>
                run("supplier_payment.cancel", row.id, {
                  cancel_reason: "画面から取消",
                })
              }
              onCorrect={(body) =>
                run("supplier_payment.correct", row.id, {
                  ...body,
                  supplier_id: row.supplierId,
                  order_id: row.orderId,
                  cancel_reason: "画面から訂正",
                })
              }
            />
          ))
        )}
      </div>

      {!caseFlow ? (
        <SupplierPaymentCreateForm
          caseId={caseId}
          busy={busy}
          orders={activeOrders}
          selectedOrderId={selectedOrderId}
          setSelectedOrderId={setSelectedOrderId}
          dueDate={dueDate}
          setDueDate={setDueDate}
          amount={amount}
          setAmount={setAmount}
          onCreate={(body) => run("supplier_payment.create", undefined, body)}
        />
      ) : null}
    </div>
  );
}

function SupplierPaymentCreateForm({
  orders,
  selectedOrderId,
  setSelectedOrderId,
  dueDate,
  setDueDate,
  amount,
  setAmount,
  busy,
  onCreate,
}: {
  caseId: string;
  orders: Props["orders"];
  selectedOrderId: string;
  setSelectedOrderId: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const selected = orders.find((o) => o.id === selectedOrderId);

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4">
      <p className="mb-3 text-xs font-semibold text-gray-600">
        支払予定登録（通常1回払い）
      </p>
      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">発注がありません。</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              対象発注
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={selectedOrderId}
                disabled={busy}
                onChange={(e) => {
                  setSelectedOrderId(e.target.value);
                  const o = orders.find((x) => x.id === e.target.value);
                  if (o) setAmount(String(o.orderAmount));
                }}
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNo || o.id} / {o.supplierName} / {formatYen(o.orderAmount)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              支払期限
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={dueDate}
                disabled={busy}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="text-xs text-gray-600">
              支払予定額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !selected?.supplierId}
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() =>
              onCreate({
                supplier_id: selected?.supplierId,
                order_id: selectedOrderId,
                due_date: dueDate || null,
                scheduled_amount: Number(amount),
              })
            }
          >
            支払予定を登録
          </button>
          {!selected?.supplierId ? (
            <p className="mt-2 text-xs text-amber-800">
              発注に仕入先IDが無いため登録できません。
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function SupplierPaymentCard({
  row,
  busy,
  hidePay = false,
  onPay,
  onCancel,
  onCorrect,
}: {
  row: SupplierPaymentView;
  busy: boolean;
  hidePay?: boolean;
  onPay: (date: string, amount: number) => void;
  onCancel: () => void;
  onCorrect: (body: Record<string, unknown>) => void;
}) {
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState(String(row.scheduledAmount));
  const [correcting, setCorrecting] = useState(false);
  const [correctForm, setCorrectForm] = useState({
    due_date: row.dueDate || "",
    scheduled_amount: String(row.scheduledAmount),
    memo: row.memo || "",
  });
  const active = row.status !== "取消";

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-gray-400">仕入先</p>
          <p className="text-sm font-semibold text-gray-900">
            {row.supplierName || "仕入先"}
          </p>
        </div>
        <StatusBadge label={row.displayStatus} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
        <div>
          <p className="text-xs text-gray-400">発注番号</p>
          <p>{row.orderNo || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">支払期限</p>
          <p>{formatDate(row.dueDate)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">支払予定額</p>
          <p>{formatYen(row.scheduledAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">支払済額</p>
          <p>{formatYen(row.paidAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">支払日</p>
          <p>{formatDate(row.paidDate)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">状態</p>
          <p>{row.displayStatus}</p>
        </div>
      </div>
      {row.memo ? <p className="mt-2 text-xs text-gray-500">備考: {row.memo}</p> : null}

      {active && row.status === "予定" ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
          {hidePay ? (
            <Link
              href="/queues/payments-management?tab=supplier"
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white"
            >
              支払管理で支払処理
            </Link>
          ) : (
            <>
              <label className="text-xs text-gray-600">
                支払日
                <input
                  type="date"
                  className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  value={paidDate}
                  disabled={busy}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </label>
              <label className="text-xs text-gray-600">
                支払済額
                <input
                  type="number"
                  min={0}
                  className="mt-1 block w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  value={paidAmount}
                  disabled={busy}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                onClick={() => onPay(paidDate, Number(paidAmount))}
              >
                支払済にする
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50"
            onClick={() => setCorrecting((v) => !v)}
          >
            訂正
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      ) : null}

      {active && row.status === "支払済" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <p className="w-full text-xs text-gray-500">
            支払済金額の直接編集はできません。変更は訂正で行います。
          </p>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50"
            onClick={() => setCorrecting((v) => !v)}
          >
            訂正
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      ) : null}

      {active && correcting ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-900">
            訂正内容（元レコード取消 + 新規予定作成）
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              支払期限
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.due_date}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({ ...f, due_date: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-gray-600">
              支払予定額
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.scheduled_amount}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({
                    ...f,
                    scheduled_amount: e.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2">
              備考
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={correctForm.memo}
                disabled={busy}
                onChange={(e) =>
                  setCorrectForm((f) => ({ ...f, memo: e.target.value }))
                }
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            onClick={() =>
              onCorrect({
                due_date: correctForm.due_date || null,
                scheduled_amount: Number(correctForm.scheduled_amount),
                memo: correctForm.memo || null,
              })
            }
          >
            訂正を実行
          </button>
        </div>
      ) : null}
    </div>
  );
}
