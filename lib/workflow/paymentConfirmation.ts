import type {
  WorkflowContext,
  WorkflowPaymentInput,
} from "@/lib/workflow/types";

const CONFIRMED_PAYMENT_STATUSES = new Set(["入金確認済"]);

/**
 * 前金入金確認（deposit_confirmed フラグは使わない）。
 * 将来拡張を見据え、請求・入金データから判定する。
 *
 * 現状ルール:
 * - status が「入金確認済」の入金合計を用いる
 * - deposit_amount > 0 なら合計 >= deposit_amount
 * - deposit_amount 未設定/0 なら、確認済入金が1件でもあれば true
 */
export function isPaymentConfirmedFromBilling(ctx: WorkflowContext): boolean {
  const confirmed = ctx.payments.filter((p) =>
    CONFIRMED_PAYMENT_STATUSES.has((p.status || "").trim())
  );
  const paid = sumPaymentAmount(confirmed);
  const deposit = ctx.depositAmount;

  if (deposit != null && Number.isFinite(deposit) && deposit > 0) {
    return paid >= deposit;
  }

  return confirmed.length > 0 && paid > 0;
}

function sumPaymentAmount(payments: readonly WorkflowPaymentInput[]): number {
  return payments.reduce((sum, p) => {
    const n = Number(p.paymentAmount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
