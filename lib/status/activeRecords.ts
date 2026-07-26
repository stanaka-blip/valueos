/**
 * 有効レコード判定（取消・キャンセル除外）
 * ダッシュボード / Workflow などから共通利用する。
 */

import { CANCELLED_PAYMENT_STATUSES } from "@/lib/payments/constants";

/** 発注の無効ステータス（Workflow conditions と同値） */
export const CANCELLED_ORDER_STATUSES = new Set(["キャンセル", "取消"]);

/** 案件の無効ステータス */
export const CANCELLED_CASE_STATUSES = new Set(["キャンセル"]);

/** 請求の無効ステータス */
export const CANCELLED_INVOICE_STATUSES = new Set(["取消"]);

function normalizeStatus(status: string | null | undefined): string {
  return (status || "").trim();
}

export function isActiveOrderStatus(
  status: string | null | undefined
): boolean {
  return !CANCELLED_ORDER_STATUSES.has(normalizeStatus(status));
}

export function isActiveCaseStatus(status: string | null | undefined): boolean {
  return !CANCELLED_CASE_STATUSES.has(normalizeStatus(status));
}

export function isActiveInvoiceStatus(
  status: string | null | undefined
): boolean {
  return !CANCELLED_INVOICE_STATUSES.has(normalizeStatus(status));
}

export function isActivePaymentStatus(
  status: string | null | undefined
): boolean {
  return !CANCELLED_PAYMENT_STATUSES.has(normalizeStatus(status));
}
