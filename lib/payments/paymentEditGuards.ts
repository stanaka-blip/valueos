import { CONFIRMED_PAYMENT_STATUSES } from "@/lib/payments/constants";
import { isActivePaymentStatus } from "@/lib/status/activeRecords";

export type PaymentRecordStatus = "確認待ち" | "入金確認済" | "取消";

const PAYMENT_RECORD_STATUSES = new Set<string>([
  "確認待ち",
  "入金確認済",
  "取消",
]);

export function isPaymentRecordStatus(
  value: string | null | undefined,
): value is PaymentRecordStatus {
  return typeof value === "string" && PAYMENT_RECORD_STATUSES.has(value);
}

/** 取消済入金は編集不可 */
export function assertPaymentEditable(
  status: string | null | undefined,
): string | null {
  if (!isActivePaymentStatus(status)) {
    return "取消済の入金は編集できません。";
  }
  return null;
}

/**
 * 入金額変更時: （他の有効入金合計 + 新しい金額）が請求額を超えないこと。
 * otherActivePaymentsSum には編集対象入金を含めない。
 * 「有効」= 取消以外（確認待ち含む）。
 */
export function assertPaymentUpdateAllowed(input: {
  invoiceAmount: number;
  otherActivePaymentsSum: number;
  nextPaymentAmount: number;
  paymentStatus: string | null | undefined;
}): string | null {
  const locked = assertPaymentEditable(input.paymentStatus);
  if (locked) return locked;

  if (
    !Number.isFinite(input.nextPaymentAmount) ||
    input.nextPaymentAmount <= 0
  ) {
    return "入金額は 0 より大きい必要があります。";
  }

  const nextTotal = input.otherActivePaymentsSum + input.nextPaymentAmount;
  if (nextTotal > input.invoiceAmount + 1e-9) {
    return `有効入金合計（${Math.round(nextTotal).toLocaleString("ja-JP")}円）が請求額（${Math.round(input.invoiceAmount).toLocaleString("ja-JP")}円）を超えるため保存できません。`;
  }
  return null;
}

export function assertPaymentCancelAllowed(
  status: string | null | undefined,
): string | null {
  if (!isActivePaymentStatus(status)) {
    return "既に取消済の入金です。";
  }
  return null;
}

/** 有効（非取消）入金の合計。編集時の他行合計に利用。 */
export function sumActivePaymentsExcluding(
  payments: Array<{
    id: string;
    payment_amount: number | null | undefined;
    status: string | null | undefined;
  }>,
  excludePaymentId: string,
): number {
  return payments.reduce((sum, p) => {
    if (p.id === excludePaymentId) return sum;
    if (!isActivePaymentStatus(p.status)) return sum;
    const amount = Number(p.payment_amount);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);
}

// re-export for callers that need confirmed-only sums elsewhere
export { CONFIRMED_PAYMENT_STATUSES };
