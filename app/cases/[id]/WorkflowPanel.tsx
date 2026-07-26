"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CARD_STATUSES, LOAN_STATUSES } from "@/lib/workflow";
import { upsertCaseSettlementByCaseId } from "@/lib/repositories/caseSettlements";
import { supabase } from "@/lib/supabase";
import type { WorkflowResult } from "@/lib/workflow";

import type { SettlementViewData } from "./settlementView";

type Props = {
  caseId: string;
  workflow: WorkflowResult;
  settlement: SettlementViewData | null;
  constructionCompletedDate: string | null;
};

export default function WorkflowPanel({
  caseId,
  workflow,
  settlement,
  constructionCompletedDate,
}: Props) {
  const router = useRouter();
  const [loanStatus, setLoanStatus] = useState(settlement?.loanStatus || "未申請");
  const [cardStatus, setCardStatus] = useState(settlement?.cardStatus || "未決済");
  const [completedDate, setCompletedDate] = useState(
    constructionCompletedDate || ""
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveWorkflowFields() {
    if (!settlement?.settlementType) {
      setError("先に決済区分を保存してください");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const now = new Date().toISOString();
    const settlementResult = await upsertCaseSettlementByCaseId(caseId, {
      settlement_type: settlement.settlementType,
      fee_rate: settlement.feeRate,
      fee_amount: settlement.feeAmount,
      deposit_rate: settlement.depositRate,
      deposit_amount: settlement.depositAmount,
      payment_terms: settlement.paymentTerms || null,
      card_brand: settlement.cardBrand || null,
      memo: settlement.memo || null,
      loan_status: loanStatus || null,
      loan_status_updated_at: now,
      card_status: cardStatus || null,
      card_status_updated_at: now,
    });

    if (settlementResult.error) {
      setSaving(false);
      setError(settlementResult.error);
      return;
    }

    const { error: caseError } = await supabase
      .from("cases")
      .update({
        construction_completed_date: completedDate || null,
      })
      .eq("id", caseId);

    setSaving(false);

    if (caseError) {
      setError(caseError.message);
      return;
    }

    setMessage("ワークフロー状態を更新しました");
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">業務ワークフロー</h2>
          <p className="mt-1 text-xs text-gray-500">
            決済区分別ルール（WorkflowEngine / SETTLEMENT_RULES）
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge ok={workflow.canOrder} okText="発注可" ngText="発注不可" />
          <Badge ok={workflow.canInvoice} okText="請求可" ngText="請求不可" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="現在の状態" value={workflow.currentState} />
        <Info label="担当" value={workflow.assignee} />
        <Info label="次のアクション" value={workflow.nextAction} />
        <Info
          label="ルール"
          value={workflow.ruleKey ? workflow.ruleKey : "未設定"}
        />
      </div>

      {(workflow.billingClosingDate || workflow.paymentDueDate) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Info
            label="締日（売掛）"
            value={workflow.billingClosingDate || "—"}
          />
          <Info
            label="入金予定日（売掛）"
            value={workflow.paymentDueDate || "—"}
          />
        </div>
      )}

      {workflow.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {workflow.warnings.map((w) => (
            <li key={w}>・{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">ローンステータス</span>
          <select
            value={loanStatus}
            onChange={(e) => setLoanStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {LOAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">カードステータス</span>
          <select
            value={cardStatus}
            onChange={(e) => setCardStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {CARD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-400">完工日</span>
          <input
            type="date"
            value={completedDate}
            onChange={(e) => setCompletedDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={saveWorkflowFields}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "保存中..." : "ワークフロー状態を保存"}
        </button>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f7f5] px-3 py-2">
      <p className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function Badge({
  ok,
  okText,
  ngText,
}: {
  ok: boolean;
  okText: string;
  ngText: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-medium ${
        ok ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
      }`}
    >
      {ok ? okText : ngText}
    </span>
  );
}
