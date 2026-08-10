/**
 * 3社間金銭イベントの表示ステータス導出（PR1・純関数）。
 * DB status は最小集合。未入金/期限超過/支払予定などはここから導出する。
 */

export const FINANCE_RECEIPT_DB_STATUSES = ["予定", "入金済", "取消"] as const;
export type FinanceReceiptDbStatus = (typeof FINANCE_RECEIPT_DB_STATUSES)[number];

export const FINANCE_RECEIPT_DISPLAY_STATUSES = [
  "未入金",
  "入金予定",
  "入金済",
  "期限超過",
  "取消",
] as const;
export type FinanceReceiptDisplayStatus =
  (typeof FINANCE_RECEIPT_DISPLAY_STATUSES)[number];

export const DEALER_SETTLEMENT_DB_STATUSES = [
  "下書き",
  "確定",
  "支払済",
  "取消",
] as const;
export type DealerSettlementDbStatus =
  (typeof DEALER_SETTLEMENT_DB_STATUSES)[number];

export const DEALER_SETTLEMENT_DISPLAY_STATUSES = [
  "下書き",
  "支払予定",
  "支払済",
  "期限超過",
  "取消",
] as const;
export type DealerSettlementDisplayStatus =
  (typeof DEALER_SETTLEMENT_DISPLAY_STATUSES)[number];

export const SUPPLIER_PAYMENT_DB_STATUSES = ["予定", "支払済", "取消"] as const;
export type SupplierPaymentDbStatus =
  (typeof SUPPLIER_PAYMENT_DB_STATUSES)[number];

export const SUPPLIER_PAYMENT_DISPLAY_STATUSES = [
  "支払予定",
  "支払済",
  "期限超過",
  "取消",
] as const;
export type SupplierPaymentDisplayStatus =
  (typeof SUPPLIER_PAYMENT_DISPLAY_STATUSES)[number];

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

/**
 * 期限日が今日より前なら超過（当日は超過にしない）。
 * 既存 invoicePaymentStatus.isPaymentOverdue と同趣旨。
 */
export function isDueDateOverdue(input: {
  dueDate: string | null | undefined;
  today?: string;
}): boolean {
  const due = parseDateOnly(input.dueDate);
  if (!due) return false;
  const today = parseDateOnly(formatToday(input.today));
  if (!today) return false;
  return due.getTime() < today.getTime();
}

export function resolveFinanceReceiptDisplayStatus(input: {
  status: string | null | undefined;
  scheduledDate?: string | null;
  today?: string;
}): FinanceReceiptDisplayStatus {
  const status = String(input.status || "").trim();
  if (status === "取消") return "取消";
  if (status === "入金済") return "入金済";
  // DB 予定（および想定外）はスケジュール有無で分岐
  if (
    isDueDateOverdue({
      dueDate: input.scheduledDate,
      today: input.today,
    })
  ) {
    return "期限超過";
  }
  if (parseDateOnly(input.scheduledDate)) {
    return "入金予定";
  }
  return "未入金";
}

export function resolveDealerSettlementDisplayStatus(input: {
  status: string | null | undefined;
  scheduledPayoutDate?: string | null;
  today?: string;
}): DealerSettlementDisplayStatus {
  const status = String(input.status || "").trim();
  if (status === "取消") return "取消";
  if (status === "支払済") return "支払済";
  if (status === "下書き") return "下書き";
  // 確定（および想定外の未払い）
  if (
    isDueDateOverdue({
      dueDate: input.scheduledPayoutDate,
      today: input.today,
    })
  ) {
    return "期限超過";
  }
  return "支払予定";
}

export function resolveSupplierPaymentDisplayStatus(input: {
  status: string | null | undefined;
  dueDate?: string | null;
  today?: string;
}): SupplierPaymentDisplayStatus {
  const status = String(input.status || "").trim();
  if (status === "取消") return "取消";
  if (status === "支払済") return "支払済";
  if (
    isDueDateOverdue({
      dueDate: input.dueDate,
      today: input.today,
    })
  ) {
    return "期限超過";
  }
  return "支払予定";
}

/** 取消行を集計から除外するとき用 */
export function isCancelledMoneyEventStatus(status: string | null | undefined): boolean {
  return String(status || "").trim() === "取消";
}
