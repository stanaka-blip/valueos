"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { assertInvoiceCancelAllowed } from "@/lib/invoices/invoiceEditGuards";
import { supabase } from "@/lib/supabase";

type SettlementRow = { status: string | null };

/**
 * 請求取消（物理DELETEなし。status='取消'）。
 * 確定済み仕切がある案件は拒否。
 */
export default function InvoiceCancelButton({
  invoiceId,
  caseId,
  currentStatus,
  disabled,
}: {
  invoiceId: string;
  caseId: string | null;
  currentStatus: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onCancel() {
    setError("");
    if (
      !window.confirm(
        "この請求を取消しますか？\n取消後は売上・未入金・回収・粗利の集計対象外になります。物理削除はしません。"
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      let settlements: SettlementRow[] = [];
      if (caseId) {
        const { data, error: settleError } = await supabase
          .from("dealer_settlements")
          .select("status")
          .eq("case_id", caseId);
        if (settleError) {
          setError(`仕切情報の確認に失敗しました：${settleError.message}`);
          return;
        }
        settlements = (data || []) as SettlementRow[];
      }

      const guardError = assertInvoiceCancelAllowed({
        invoiceStatus: currentStatus,
        dealerSettlementStatuses: settlements.map((s) => s.status),
      });
      if (guardError) {
        setError(guardError);
        return;
      }

      const { error: updateError } = await supabase
        .from("invoices")
        .update({ status: "取消" })
        .eq("id", invoiceId);

      if (updateError) {
        setError(`請求の取消に失敗しました：${updateError.message}`);
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void onCancel()}
        disabled={disabled || busy}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "取消中..." : "請求を取消"}
      </button>
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
