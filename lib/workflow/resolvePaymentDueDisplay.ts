/**
 * 売掛の入金予定日 / 支払期限の表示用。
 *
 * 業務ルール: 実納品日が属する月の翌月末（computeCreditDates / paymentDueDate）。
 * 請求後の表示は原則 invoices.due_date。ただし保存値がルールと違う場合は
 * 一致と扱わず isMismatch にする（UPDATE はしない）。
 * 3社間には適用しない。
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
  ruleDueDate: string | null;
  savedDueDate: string | null;
  isMismatch: boolean;
};

function emptyDisplay(): PaymentDueDisplay {
  return {
    kind: "none",
    date: null,
    label: null,
    ruleDueDate: null,
    savedDueDate: null,
    isMismatch: false,
  };
}

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

export function isCreditDueDateMismatch(
  ruleDueDate: string | null | undefined,
  savedDueDate: string | null | undefined
): boolean {
  const rule = (ruleDueDate || "").trim();
  const saved = (savedDueDate || "").trim();
  if (!rule || !saved) return false;
  return rule !== saved;
}

export function resolvePaymentDueDisplay(input: {
  ruleKey: string | null | undefined;
  invoices: ReadonlyArray<PaymentDueInvoiceInput>;
  plannedPaymentDueDate: string | null | undefined;
}): PaymentDueDisplay {
  if (input.ruleKey !== "売掛") {
    return emptyDisplay();
  }

  const ruleDueDate = (input.plannedPaymentDueDate || "").trim() || null;
  const savedDueDate = pickEarliestActiveInvoiceDueDate(input.invoices);

  if (savedDueDate) {
    return {
      kind: "confirmed",
      date: savedDueDate,
      label: "支払期限",
      ruleDueDate,
      savedDueDate,
      isMismatch: isCreditDueDateMismatch(ruleDueDate, savedDueDate),
    };
  }

  if (ruleDueDate) {
    return {
      kind: "planned",
      date: ruleDueDate,
      label: "入金予定日（予定）",
      ruleDueDate,
      savedDueDate: null,
      isMismatch: false,
    };
  }

  return emptyDisplay();
}
