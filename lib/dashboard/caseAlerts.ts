/**
 * ダッシュボード業務アラート用:
 * WorkflowEngine.canOrder / canInvoice を案件ごとに評価する。
 *
 * 未発注 = canOrder === true かつ 有効発注 0 件
 * 未請求 = canInvoice === true かつ 有効請求 0 件
 * （canOrder/canInvoice が false の案件は数えない）
 */

import {
  isActiveCaseStatus,
  isActiveInvoiceStatus,
  isActiveOrderStatus,
} from "@/lib/status/activeRecords";
import { buildWorkflowContext } from "@/lib/workflow/buildContext";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import { supabase } from "@/lib/supabase";

export async function loadWorkflowAlertCaseIds(): Promise<{
  unorderedCaseIds: string[];
  uninvoicedCaseIds: string[];
  error: string | null;
}> {
  // construction_completed_date は環境により未適用のためフォールバック
  type CaseRow = {
    id: string;
    status: string | null;
    construction_completed_date?: string | null;
  };
  let cases: CaseRow[] = [];
  let casesError: { message: string } | null = null;
  const withCompleted = await supabase
    .from("cases")
    .select("id, status, construction_completed_date");
  if (
    withCompleted.error &&
    /construction_completed_date|schema cache/i.test(withCompleted.error.message)
  ) {
    const fallback = await supabase.from("cases").select("id, status");
    cases = (fallback.data || []) as CaseRow[];
    casesError = fallback.error;
  } else {
    cases = (withCompleted.data || []) as CaseRow[];
    casesError = withCompleted.error;
  }

  const [
    { data: orders, error: ordersError },
    { data: invoices, error: invoicesError },
    { data: payments, error: paymentsError },
    { data: settlements, error: settlementsError },
  ] = await Promise.all([
    supabase.from("orders").select("id, case_id, status, delivered_date"),
    supabase.from("invoices").select("id, case_id, status, invoice_amount"),
    supabase
      .from("payments")
      .select("id, case_id, invoice_id, status, payment_amount"),
    supabase.from("case_settlements").select("*"),
  ]);

  const error =
    casesError?.message ||
    ordersError?.message ||
    invoicesError?.message ||
    paymentsError?.message ||
    settlementsError?.message ||
    null;

  if (error) {
    return { unorderedCaseIds: [], uninvoicedCaseIds: [], error };
  }

  const ordersByCase = groupBy(orders || [], "case_id");
  const invoicesByCase = groupBy(invoices || [], "case_id");
  const paymentsByCase = groupBy(payments || [], "case_id");
  type SettlementRow = NonNullable<typeof settlements>[number];
  const settlementByCase = new Map<string, SettlementRow>();
  for (const s of settlements || []) {
    settlementByCase.set(s.case_id as string, s);
  }

  const unorderedCaseIds: string[] = [];
  const uninvoicedCaseIds: string[] = [];

  for (const c of cases || []) {
    if (!isActiveCaseStatus(c.status)) continue;
    const caseId = c.id;
    const wf = evaluateWorkflow(
      buildWorkflowContext({
        settlement: settlementByCase.get(caseId) || null,
        constructionCompletedDate: c.construction_completed_date ?? null,
        orders: ordersByCase.get(caseId) || [],
        invoices: invoicesByCase.get(caseId) || [],
        payments: paymentsByCase.get(caseId) || [],
      })
    );

    const activeOrderCount = (ordersByCase.get(caseId) || []).filter((o) =>
      isActiveOrderStatus(o.status as string)
    ).length;
    const activeInvoiceCount = (invoicesByCase.get(caseId) || []).filter((i) =>
      isActiveInvoiceStatus(i.status as string)
    ).length;

    if (wf.canOrder === true && activeOrderCount === 0) {
      unorderedCaseIds.push(caseId);
    }
    if (wf.canInvoice === true && activeInvoiceCount === 0) {
      uninvoicedCaseIds.push(caseId);
    }
  }

  return { unorderedCaseIds, uninvoicedCaseIds, error: null };
}

function groupBy<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = row[key] as string | null | undefined;
    if (!id) continue;
    const list = map.get(id) || [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}
