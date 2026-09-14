import { CONFIRMED_PAYMENT_STATUSES } from "@/lib/payments/constants";
import { isActiveInvoiceStatus } from "@/lib/status/activeRecords";

/** 確定済み仕切がある場合、請求額変更・取消を拒否する（3社間最小安全策） */
export const LOCKING_DEALER_SETTLEMENT_STATUSES = new Set([
  "確定",
  "支払済",
]);

export function hasLockingDealerSettlement(
  statuses: Array<string | null | undefined>,
): boolean {
  return statuses.some(
    (s) => typeof s === "string" && LOCKING_DEALER_SETTLEMENT_STATUSES.has(s),
  );
}

export function sumConfirmedPaymentsForInvoiceGuard(
  payments: Array<{
    payment_amount: number | null | undefined;
    status: string | null | undefined;
  }>,
): number {
  return payments.reduce((sum, p) => {
    const status = (p.status || "").trim();
    if (!CONFIRMED_PAYMENT_STATUSES.has(status)) return sum;
    const amount = Number(p.payment_amount);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);
}

export function assertInvoiceEditable(
  status: string | null | undefined,
): string | null {
  if (!isActiveInvoiceStatus(status)) {
    return "取消済の請求は編集できません。";
  }
  return null;
}

/**
 * 有効な確認済入金合計 <= 新しい請求額
 * 取消済入金は含めない。確認済のみ。
 */
export function assertInvoiceAmountChangeAllowed(input: {
  invoiceStatus: string | null | undefined;
  nextInvoiceAmount: number;
  confirmedPaymentsSum: number;
  dealerSettlementStatuses?: Array<string | null | undefined>;
}): string | null {
  const locked = assertInvoiceEditable(input.invoiceStatus);
  if (locked) return locked;

  if (
    !Number.isFinite(input.nextInvoiceAmount) ||
    input.nextInvoiceAmount < 0
  ) {
    return "請求額は 0 以上である必要があります。";
  }

  if (
    input.dealerSettlementStatuses &&
    hasLockingDealerSettlement(input.dealerSettlementStatuses)
  ) {
    return "確定済みまたは支払済の仕切があるため、請求額を変更できません。";
  }

  if (input.confirmedPaymentsSum > input.nextInvoiceAmount + 1e-9) {
    return `確認済入金合計（${Math.round(input.confirmedPaymentsSum).toLocaleString("ja-JP")}円）が新しい請求額（${Math.round(input.nextInvoiceAmount).toLocaleString("ja-JP")}円）を超えるため保存できません。`;
  }
  return null;
}

export function assertInvoiceCancelAllowed(input: {
  invoiceStatus: string | null | undefined;
  dealerSettlementStatuses?: Array<string | null | undefined>;
  /** 取消以外の入金が1件でもあれば取消不可 */
  hasActivePayments?: boolean;
}): string | null {
  if (!isActiveInvoiceStatus(input.invoiceStatus)) {
    return "既に取消済の請求です。";
  }
  if (input.hasActivePayments) {
    return "この請求には入金履歴があります。先に入金を取消してから、請求を取消してください。";
  }
  if (
    input.dealerSettlementStatuses &&
    hasLockingDealerSettlement(input.dealerSettlementStatuses)
  ) {
    return "確定済みまたは支払済の仕切があるため、請求を取消できません。";
  }
  return null;
}
