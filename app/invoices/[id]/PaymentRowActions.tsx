"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { assertPaymentCancelAllowed } from "@/lib/payments/paymentEditGuards";
import { isActivePaymentStatus } from "@/lib/status/activeRecords";
import { supabase } from "@/lib/supabase";

function formatRpcError(message: string) {
  const match = message.match(/^APP:[A-Z_]+:([\s\S]+)$/);
  return match?.[1]?.trim() || message;
}

/**
 * 入金行の編集・取消アクション。
 * 取消は cancel_payment RPC のみ（物理DELETEなし。直接 table UPDATE 禁止）。
 */
export default function PaymentRowActions({
  invoiceId,
  paymentId,
  paymentStatus,
}: {
  invoiceId: string;
  paymentId: string;
  paymentStatus: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = isActivePaymentStatus(paymentStatus);

  async function onCancel() {
    setError("");
    if (
      !window.confirm(
        "この入金を取消しますか？\n取消後は入金済額・未入金・回収管理に反映されます。物理削除はしません。"
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const guardError = assertPaymentCancelAllowed(paymentStatus);
      if (guardError) {
        setError(guardError);
        return;
      }

      const { error: rpcError } = await supabase.rpc("cancel_payment", {
        payload: { payment_id: paymentId },
      });

      if (rpcError) {
        setError(`入金の取消に失敗しました：${formatRpcError(rpcError.message)}`);
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
      {active ? (
        <>
          <Link
            href={`/invoices/${invoiceId}/payments/${paymentId}/edit`}
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            編集
          </Link>
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {busy ? "取消中..." : "取消"}
          </button>
        </>
      ) : (
        <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-600">
          取消済（編集不可）
        </span>
      )}
      {error ? (
        <p className="w-full text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
