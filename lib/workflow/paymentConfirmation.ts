import { sumConfirmedPaidAmount } from "@/lib/payments/invoicePaymentStatus";
import type { WorkflowContext } from "@/lib/workflow/types";

/**
 * 前金入金確認（deposit_confirmed フラグは使わない）。
 * 将来拡張を見据え、請求・入金データから判定する。
 *
 * 現状ルール:
 * - 確認済入金合計は payments 共通の sumConfirmedPaidAmount を利用
 * - deposit_amount > 0 なら合計 >= deposit_amount
 * - deposit_amount 未設定/0 なら、確認済入金合計 > 0 なら true
 *
 * 「確認済だけ合計する」ロジックは lib/payments 側に一本化。
 * deposit との比較は Workflow 側の責務としてここに残す。
 */
export function isPaymentConfirmedFromBilling(ctx: WorkflowContext): boolean {
  const paid = sumConfirmedPaidAmount(
    ctx.payments.map((p) => ({
      paymentAmount: p.paymentAmount,
      status: p.status,
    }))
  );
  const deposit = ctx.depositAmount;

  if (deposit != null && Number.isFinite(deposit) && deposit > 0) {
    return paid >= deposit;
  }

  return paid > 0;
}
