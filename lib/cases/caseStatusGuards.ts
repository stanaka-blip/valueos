/**
 * 案件ステータス手動変更のガード（純関数）。
 * 「請求済」は有効な請求書の存在を根拠にする。
 */

import { isActiveInvoiceStatus } from "@/lib/status/activeRecords";

export const CASE_STATUS_INVOICED = "請求済";

export const MANUAL_INVOICED_STATUS_BLOCKED_MESSAGE =
  "請求済にするには、有効な請求書が必要です。請求登録から発行してください。";

/** 手動で「請求済」へ変更してよいか */
export function canManuallySetCaseStatusToInvoiced(input: {
  nextStatus: string;
  activeInvoiceCount: number;
}): { ok: true } | { ok: false; message: string } {
  if (input.nextStatus !== CASE_STATUS_INVOICED) {
    return { ok: true };
  }
  if (input.activeInvoiceCount > 0) {
    return { ok: true };
  }
  return { ok: false, message: MANUAL_INVOICED_STATUS_BLOCKED_MESSAGE };
}

export function countActiveInvoices(
  invoices: ReadonlyArray<{ status?: string | null }>
): number {
  return invoices.filter((inv) => isActiveInvoiceStatus(inv.status)).length;
}

/**
 * 請求取消後、有効請求が0件なら案件を「納品済」へ戻す候補にする。
 * 現在が請求済系でない場合は変更しない。
 */
export function resolveCaseStatusAfterInvoiceCancel(input: {
  currentCaseStatus: string | null | undefined;
  remainingActiveInvoiceCount: number;
}): string | null {
  if (input.remainingActiveInvoiceCount > 0) return null;
  const status = (input.currentCaseStatus || "").trim();
  if (status === "請求済" || status === "入金待ち") {
    return "納品済";
  }
  return null;
}
