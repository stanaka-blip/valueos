import { buildWorkflowContext } from "@/lib/workflow/buildContext";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import type { WorkflowResult } from "@/lib/workflow/types";
import { getCaseSettlementByCaseId } from "@/lib/repositories/caseSettlements";
import { supabase } from "@/lib/supabase";

/**
 * クライアント / サーバー双方から案件の Workflow を評価する。
 */
export async function loadCaseWorkflow(caseId: string): Promise<{
  result: WorkflowResult;
  error: string | null;
}> {
  const [settlementResult, caseRes, ordersRes, invoicesRes, paymentsRes] =
    await Promise.all([
      getCaseSettlementByCaseId(caseId),
      supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, status, delivered_date")
        .eq("case_id", caseId),
      supabase
        .from("invoices")
        .select("id, status, invoice_amount")
        .eq("case_id", caseId),
      supabase
        .from("payments")
        .select("id, invoice_id, status, payment_amount")
        .eq("case_id", caseId),
    ]);

  const error =
    settlementResult.error ||
    caseRes.error?.message ||
    ordersRes.error?.message ||
    invoicesRes.error?.message ||
    paymentsRes.error?.message ||
    null;

  const ctx = buildWorkflowContext({
    settlement: settlementResult.data,
    constructionCompletedDate:
      (caseRes.data?.construction_completed_date as string | null) || null,
    orders: ordersRes.data || [],
    invoices: invoicesRes.data || [],
    payments: paymentsRes.data || [],
  });

  return {
    result: evaluateWorkflow(ctx),
    error,
  };
}
