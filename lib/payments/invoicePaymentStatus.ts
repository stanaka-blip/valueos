import {
  CANCELLED_PAYMENT_STATUSES,
  CONFIRMED_PAYMENT_STATUSES,
  type InvoicePaymentStatus,
} from "@/lib/payments/constants";

export type PaymentAmountInput = {
  paymentAmount: number;
  status: string | null | undefined;
};

export type InvoicePaymentSummary = {
  invoiceAmount: number;
  confirmedPaidAmount: number;
  unpaidAmount: number;
  overpaidAmount: number;
  /** 未入金 | 一部入金 | 入金済（期限超過は isOverdue で別判定） */
  paymentStatus: Exclude<InvoicePaymentStatus, "期限超過">;
  /** 表示用。期限超過時は「期限超過」 */
  displayStatus: InvoicePaymentStatus;
  isOverdue: boolean;
  delayDays: number;
  nextAction: string;
  warnings: string[];
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function formatToday(today?: string): string {
  if (today) return today;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 確認済入金のみ合計。取消・確認待ちは除外。 */
export function sumConfirmedPaidAmount(
  payments: readonly PaymentAmountInput[]
): number {
  return payments.reduce((sum, p) => {
    const status = (p.status || "").trim();
    if (!CONFIRMED_PAYMENT_STATUSES.has(status)) return sum;
    if (CANCELLED_PAYMENT_STATUSES.has(status)) return sum;
    return sum + Math.max(0, toNumber(p.paymentAmount));
  }, 0);
}

export function resolvePaymentStatus(
  invoiceAmount: number,
  confirmedPaidAmount: number
): Exclude<InvoicePaymentStatus, "期限超過"> {
  const amount = Math.max(0, toNumber(invoiceAmount));
  const paid = Math.max(0, toNumber(confirmedPaidAmount));
  if (paid <= 0) return "未入金";
  if (paid < amount) return "一部入金";
  return "入金済";
}

/**
 * 入金予定日が今日より前、かつ未入金が残っている場合に期限超過。
 * 期限当日は遅延扱いしない。
 */
export function isPaymentOverdue(input: {
  dueDate: string | null | undefined;
  unpaidAmount: number;
  today?: string;
}): boolean {
  if (input.unpaidAmount <= 0) return false;
  const due = parseDateOnly(input.dueDate);
  if (!due) return false;
  const today = parseDateOnly(formatToday(input.today));
  if (!today) return false;
  return due.getTime() < today.getTime();
}

export function calcDelayDays(input: {
  dueDate: string | null | undefined;
  unpaidAmount: number;
  today?: string;
}): number {
  if (!isPaymentOverdue(input)) return 0;
  const due = parseDateOnly(input.dueDate);
  const today = parseDateOnly(formatToday(input.today));
  if (!due || !today) return 0;
  const diffMs = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

export function resolveNextAction(
  displayStatus: InvoicePaymentStatus
): string {
  switch (displayStatus) {
    case "未入金":
      return "入金を登録してください";
    case "一部入金":
      return "残額の入金を登録してください";
    case "期限超過":
      return "督促・入金確認を行ってください";
    case "入金済":
      return "対応不要";
    default:
      return "入金状況を確認してください";
  }
}

export function summarizeInvoicePayments(input: {
  invoiceAmount: number | string | null | undefined;
  dueDate: string | null | undefined;
  payments: readonly PaymentAmountInput[];
  today?: string;
}): InvoicePaymentSummary {
  const invoiceAmount = Math.max(0, toNumber(input.invoiceAmount));
  const confirmedPaidAmount = sumConfirmedPaidAmount(input.payments);
  const unpaidAmount = Math.max(0, invoiceAmount - confirmedPaidAmount);
  const overpaidAmount = Math.max(0, confirmedPaidAmount - invoiceAmount);
  const paymentStatus = resolvePaymentStatus(invoiceAmount, confirmedPaidAmount);
  const overdue = isPaymentOverdue({
    dueDate: input.dueDate,
    unpaidAmount,
    today: input.today,
  });
  const displayStatus: InvoicePaymentStatus =
    overdue && paymentStatus !== "入金済" ? "期限超過" : paymentStatus;
  const warnings: string[] = [];
  if (overpaidAmount > 0) {
    warnings.push(
      `過入金があります（過入金額: ${overpaidAmount.toLocaleString("ja-JP")}円）`
    );
  }

  return {
    invoiceAmount,
    confirmedPaidAmount,
    unpaidAmount,
    overpaidAmount,
    paymentStatus,
    displayStatus,
    isOverdue: overdue,
    delayDays: calcDelayDays({
      dueDate: input.dueDate,
      unpaidAmount,
      today: input.today,
    }),
    nextAction: resolveNextAction(displayStatus),
    warnings,
  };
}

/** 今月（YYYY-MM）判定用 */
export function isSameMonth(
  dateStr: string | null | undefined,
  today?: string
): boolean {
  const d = parseDateOnly(dateStr);
  const t = parseDateOnly(formatToday(today));
  if (!d || !t) return false;
  return (
    d.getUTCFullYear() === t.getUTCFullYear() &&
    d.getUTCMonth() === t.getUTCMonth()
  );
}
