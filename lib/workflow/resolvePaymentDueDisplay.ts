/**
 * 売掛の入金予定日 / 支払期限の表示用。
 * 有効請求の定義と due_date 選択は回収管理 evaluateCredit と同じ。
 * 3社間には適用しない（顧客 due を出さない）。
 */

import { activeInvoicesForCollection } from "@/lib/queues/collectionQueue";

export type PaymentDueInvoiceInput = {
  status?: string | null;
  due_date?: string | null;
};

export type PaymentDueDisplay = {
  kind: "planned" | "confirmed" | "none";
  date: string | null;
  label: string | null;
};

/**
 * 回収管理 evaluateCredit と同じ:
 * 有効請求（取消以外）の due_date を昇順ソートし、先頭（最も早い日）を使う。
 */
export function pickEarliestActiveInvoiceDueDate(
  invoices: ReadonlyArray<PaymentDueInvoiceInput>
): string | null {
  const dueDates = activeInvoicesForCollection(invoices)
    .map((inv) => (inv.due_date || "").trim())
    .filter(Boolean)
    .sort();
  return dueDates[0] || null;
}

export function resolvePaymentDueDisplay(input: {
  ruleKey: string | null | undefined;
  invoices: ReadonlyArray<PaymentDueInvoiceInput>;
  plannedPaymentDueDate: string | null | undefined;
}): PaymentDueDisplay {
  if (input.ruleKey !== "売掛") {
    return { kind: "none", date: null, label: null };
  }

  const confirmed = pickEarliestActiveInvoiceDueDate(input.invoices);
  if (confirmed) {
    return { kind: "confirmed", date: confirmed, label: "支払期限" };
  }

  const planned = (input.plannedPaymentDueDate || "").trim() || null;
  if (planned) {
    return { kind: "planned", date: planned, label: "入金予定日（予定）" };
  }

  return { kind: "none", date: null, label: null };
}
