"use client";

import { useState } from "react";

import {
  buildFinanceReceiptPaidConfirmBody,
  buildFinanceReceiptPaidCreateBody,
} from "@/lib/threeParty/financeReceiptRegister";
import { submitThreePartyMoney } from "@/app/cases/[id]/submitThreePartyMoney";

export type FinanceReceiptPaidFormValues = {
  finance_company: string;
  actual_date: string;
  actual_amount: string;
  memo: string;
};

type Props = {
  caseId: string;
  financeCompanyDefault?: string;
  /** 二重登録不可のとき true（フォーム自体を出さない想定でもメッセージ用） */
  blockedReason?: string | null;
  disabled?: boolean;
  compact?: boolean;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

/**
 * 回収管理 / 入金管理 / 支払管理 / 案件詳細で共有する信販入金1ステップ登録。
 * 内部は finance_receipt.create → confirm（入金済）。
 */
export default function FinanceReceiptPaidForm({
  caseId,
  financeCompanyDefault = "",
  blockedReason = null,
  disabled = false,
  compact = false,
  onSuccess,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FinanceReceiptPaidFormValues>({
    finance_company: financeCompanyDefault || "",
    actual_date: new Date().toISOString().slice(0, 10),
    actual_amount: "",
    memo: "",
  });

  async function registerPaid() {
    if (blockedReason) {
      setError(blockedReason);
      onError?.(blockedReason);
      return;
    }
    setBusy(true);
    setError("");
    const paid = {
      finance_company: form.finance_company,
      actual_date: form.actual_date,
      actual_amount: Number(form.actual_amount),
      memo: form.memo || null,
    };
    const created = await submitThreePartyMoney({
      action: "finance_receipt.create",
      caseId,
      body: buildFinanceReceiptPaidCreateBody(paid),
    });
    if (!created.ok) {
      setBusy(false);
      setError(created.error_message);
      onError?.(created.error_message);
      return;
    }
    const confirmed = await submitThreePartyMoney({
      action: "finance_receipt.confirm",
      caseId,
      resourceId: created.resource_id,
      body: buildFinanceReceiptPaidConfirmBody(paid),
    });
    setBusy(false);
    if (!confirmed.ok) {
      setError(confirmed.error_message);
      onError?.(confirmed.error_message);
      return;
    }
    onSuccess?.();
  }

  if (blockedReason) {
    return (
      <p className="text-xs text-amber-800">
        {blockedReason}
      </p>
    );
  }

  return (
    <div
      className={
        compact
          ? "space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3"
          : "space-y-3 rounded-lg border border-dashed border-teal-300 bg-teal-50/40 p-4"
      }
    >
      <p className="text-xs font-semibold text-teal-900">信販入金を登録</p>
      <p className="text-xs text-teal-900/80">
        信販会社から実際に振り込まれた契約金額を登録します（商品請求への顧客入金ではありません）。登録時点で入金済になります。
      </p>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          信販会社
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.finance_company}
            disabled={busy || disabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, finance_company: e.target.value }))
            }
          />
        </label>
        <label className="text-xs text-gray-600">
          実入金日
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.actual_date}
            disabled={busy || disabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, actual_date: e.target.value }))
            }
          />
        </label>
        <label className="text-xs text-gray-600">
          実入金額（契約金額）
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.actual_amount}
            disabled={busy || disabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, actual_amount: e.target.value }))
            }
          />
        </label>
        <label className="text-xs text-gray-600">
          備考
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.memo}
            disabled={busy || disabled}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={
          busy ||
          disabled ||
          !form.finance_company ||
          !form.actual_date ||
          form.actual_amount === ""
        }
        className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        onClick={() => registerPaid()}
      >
        信販入金を登録
      </button>
    </div>
  );
}
