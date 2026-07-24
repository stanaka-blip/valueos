"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  CASE_SETTLEMENT_TYPES,
  type CaseSettlementType,
} from "@/lib/caseSettlementTypes";
import { upsertCaseSettlementByCaseId } from "@/lib/repositories/caseSettlements";

import type { SettlementViewData } from "./settlementView";

type Props = {
  caseId: string;
  settlement: SettlementViewData | null;
  loadError?: string;
  dealerPaymentType?: string;
};

function toInputNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "";
  }
  return String(value);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function suggestSettlementType(
  dealerPaymentType: string | undefined
): CaseSettlementType {
  const raw = (dealerPaymentType || "").trim();
  if (raw === "前金") return "前金";
  if (raw === "三社間決済" || raw === "3社間" || raw === "三社間") {
    return "三社間決済";
  }
  if (raw === "売掛" || raw === "掛売") return "掛売";
  if (raw === "カード") return "カード";
  return "掛売";
}

function initialSettlementType(
  settlement: SettlementViewData | null,
  dealerPaymentType: string | undefined
): CaseSettlementType {
  const current = settlement?.settlementType;
  if (
    current &&
    (CASE_SETTLEMENT_TYPES as readonly string[]).includes(current)
  ) {
    return current as CaseSettlementType;
  }
  return suggestSettlementType(dealerPaymentType);
}

export default function SettlementForm({
  caseId,
  settlement,
  loadError,
  dealerPaymentType,
}: Props) {
  const router = useRouter();
  const [settlementType, setSettlementType] = useState<CaseSettlementType>(
    initialSettlementType(settlement, dealerPaymentType)
  );
  const [feeRate, setFeeRate] = useState(toInputNumber(settlement?.feeRate));
  const [feeAmount, setFeeAmount] = useState(
    toInputNumber(settlement?.feeAmount || null)
  );
  const [depositRate, setDepositRate] = useState(
    toInputNumber(settlement?.depositRate)
  );
  const [depositAmount, setDepositAmount] = useState(
    toInputNumber(settlement?.depositAmount)
  );
  const [paymentTerms, setPaymentTerms] = useState(
    settlement?.paymentTerms || ""
  );
  const [cardBrand, setCardBrand] = useState(settlement?.cardBrand || "");
  const [memo, setMemo] = useState(settlement?.memo || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);

    const result = await upsertCaseSettlementByCaseId(caseId, {
      settlement_type: settlementType,
      fee_rate: parseOptionalNumber(feeRate),
      fee_amount: parseOptionalNumber(feeAmount) ?? 0,
      deposit_rate: parseOptionalNumber(depositRate),
      deposit_amount: parseOptionalNumber(depositAmount),
      payment_terms: paymentTerms.trim() || null,
      card_brand: cardBrand.trim() || null,
      memo: memo.trim() || null,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSavedMessage("決済条件を保存しました");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {loadError ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          決済テーブル未適用または取得エラー：{loadError}
          <span className="mt-1 block text-xs text-amber-700">
            Phase1 の DDL（case_settlements）適用後に保存できます。
          </span>
        </p>
      ) : null}

      {!settlement && !loadError ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-[#f7f7f5] px-3 py-2 text-sm text-gray-500">
          決済条件は未設定です。区分を選んで保存してください
          {dealerPaymentType
            ? `（販売店の決済条件: ${dealerPaymentType}）`
            : ""}
          。
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">決済区分</span>
          <select
            value={settlementType}
            onChange={(e) =>
              setSettlementType(e.target.value as CaseSettlementType)
            }
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            required
          >
            {CASE_SETTLEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">カードブランド</span>
          <input
            value={cardBrand}
            onChange={(e) => setCardBrand(e.target.value)}
            placeholder="Visa / など"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">
            決済手数料率（%）
          </span>
          <input
            type="number"
            step="0.01"
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">
            決済手数料額（円）
          </span>
          <input
            type="number"
            step="1"
            value={feeAmount}
            onChange={(e) => setFeeAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">前金率（%）</span>
          <input
            type="number"
            step="0.01"
            value={depositRate}
            onChange={(e) => setDepositRate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">前金額（円）</span>
          <input
            type="number"
            step="1"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="text-xs font-medium text-gray-400">支払条件</span>
          <input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="例: 翌月末払い"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="text-xs font-medium text-gray-400">備考</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {savedMessage ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {savedMessage}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "保存中..." : settlement ? "決済条件を更新" : "決済条件を保存"}
        </button>
      </div>
    </form>
  );
}
