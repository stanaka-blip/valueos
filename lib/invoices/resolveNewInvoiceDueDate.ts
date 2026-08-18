/**
 * 新規請求フォームの支払期限初期値。
 * workflow の予定日があればそれを優先し、ユーザー手入力は上書きしない。
 * 既存 invoices.due_date は扱わない（新規フォーム専用）。
 */

export function resolveNewInvoiceDueDate(input: {
  userTouched: boolean;
  currentDueDate: string;
  workflowPaymentDueDate?: string | null;
  fallbackDueDate: string;
}): string {
  if (input.userTouched) {
    return input.currentDueDate;
  }
  const planned = (input.workflowPaymentDueDate || "").trim();
  if (planned) {
    return planned;
  }
  const current = (input.currentDueDate || "").trim();
  if (current) {
    return current;
  }
  return input.fallbackDueDate;
}
