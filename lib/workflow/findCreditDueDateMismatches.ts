/**
 * 売掛・有効請求の due_date が「実納品月の翌月末」と不一致かを検出する（SELECT 相当）。
 * UPDATE / backfill はしない。
 */
import { computeCreditDates } from "@/lib/workflow/conditions";
import { resolveSettlementRule } from "@/lib/workflow/normalize";
import {
  isCreditDueDateMismatch,
  pickEarliestActiveInvoiceDueDate,
} from "@/lib/workflow/resolvePaymentDueDisplay";

export type CreditDueDateMismatchCaseInput = {
  caseId: string;
  caseNo: string | null;
  settlementType: string | null;
  orders: ReadonlyArray<{
    status?: string | null;
    deliveredDate?: string | null;
    delivered_date?: string | null;
  }>;
  invoices: ReadonlyArray<{
    id?: string;
    status?: string | null;
    due_date?: string | null;
  }>;
};

export type CreditDueDateMismatchRow = {
  caseId: string;
  caseNo: string | null;
  lastDeliveredDate: string | null;
  ruleDueDate: string;
  savedDueDate: string;
};

export function findCreditDueDateMismatches(
  cases: ReadonlyArray<CreditDueDateMismatchCaseInput>
): CreditDueDateMismatchRow[] {
  const rows: CreditDueDateMismatchRow[] = [];
  for (const item of cases) {
    if (resolveSettlementRule(item.settlementType)?.key !== "売掛") {
      continue;
    }
    const orders = item.orders.map((order) => ({
      id: "order",
      status: order.status ?? null,
      deliveredDate: order.deliveredDate ?? order.delivered_date ?? null,
    }));
    const planned = computeCreditDates(orders).paymentDueDate;
    const saved = pickEarliestActiveInvoiceDueDate(item.invoices);
    if (!isCreditDueDateMismatch(planned, saved) || !planned || !saved) {
      continue;
    }
    const lastDeliveredDate = [...orders]
      .map((order) => (order.deliveredDate || "").trim())
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    rows.push({
      caseId: item.caseId,
      caseNo: item.caseNo,
      lastDeliveredDate,
      ruleDueDate: planned,
      savedDueDate: saved,
    });
  }
  return rows;
}
