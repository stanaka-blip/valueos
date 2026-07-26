/**
 * ダッシュボード業務アラート用:
 * WorkflowEngine.canOrder / canInvoice を案件ごとに評価する。
 * 発注可否・請求可否の判定ロジック自体は Engine に委譲。
 */

import { buildWorkflowContext } from "@/lib/workflow/buildContext";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import { supabase } from "@/lib/supabase";

export async function loadWorkflowAlertCaseIds(): Promise<{
  unorderedCaseIds: string[];
  uninvoicedCaseIds: string[];
  error: string | null;
}> {
  const [
    { data: cases, error: casesError },
    { data: orders, error: ordersError },
    { data: invoices, error: invoicesError },
    { data: payments, error: paymentsError },
    { data: settlements, error: settlementsError },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select("id, status, construction_completed_date"),
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
  const settlementByCase = new Map<string, (typeof settlements)[number]>();
  for (const s of settlements || []) {
    settlementByCase.set(s.case_id as string, s);
  }

  const unorderedCaseIds: string[] = [];
  const uninvoicedCaseIds: string[] = [];

  for (const c of cases || []) {
    if ((c.status as string) === "キャンセル") continue;
    const caseId = c.id as string;
    const wf = evaluateWorkflow(
      buildWorkflowContext({
        settlement: settlementByCase.get(caseId) || null,
        constructionCompletedDate:
          (c.construction_completed_date as string | null) || null,
        orders: ordersByCase.get(caseId) || [],
        invoices: invoicesByCase.get(caseId) || [],
        payments: paymentsByCase.get(caseId) || [],
      })
    );

    const caseOrders = (ordersByCase.get(caseId) || []).filter(
      (o) =>
        (o.status as string) !== "キャンセル" &&
        (o.status as string) !== "取消"
    );
    const caseInvoices = (invoicesByCase.get(caseId) || []).filter(
      (i) => (i.status as string) !== "取消"
    );

    if (wf.canOrder && caseOrders.length === 0) {
      unorderedCaseIds.push(caseId);
    }
    if (wf.canInvoice && caseInvoices.length === 0) {
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
