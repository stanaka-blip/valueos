import "server-only";

import { getCaseSettlementByCaseIdAdmin } from "@/lib/caseSettlements/getCaseSettlementAdmin";
import {
  evaluateCaseWorkflowFromSettlement,
  type EvaluateCaseWorkflowFromSettlementResult,
} from "@/lib/workflow/evaluateCaseWorkflowFromSettlement";
import { supabase } from "@/lib/supabase";
import { ServerAdminConfigError } from "@/lib/supabase/serverAdmin";

/**
 * 案件詳細と同じく決済は service_role（admin）で読み、Workflow を評価する。
 * orders / invoices / payments は案件詳細と同様に既存 supabase クライアントで取得。
 * クライアントの anon 直読み（loadCaseWorkflow）は使わない。
 */
export async function loadCaseWorkflowAdmin(
  caseId: string
): Promise<EvaluateCaseWorkflowFromSettlementResult> {
  try {
    const [settlementResult, caseRes, ordersRes, invoicesRes, paymentsRes] =
      await Promise.all([
        getCaseSettlementByCaseIdAdmin(caseId),
        supabase
          .from("cases")
          .select("id, construction_completed_date")
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

    const relatedError =
      caseRes.error?.message ||
      ordersRes.error?.message ||
      invoicesRes.error?.message ||
      paymentsRes.error?.message ||
      null;

    return evaluateCaseWorkflowFromSettlement({
      settlementResult,
      relatedError,
      related: {
        constructionCompletedDate:
          (caseRes.data?.construction_completed_date as string | null) || null,
        orders: ordersRes.data || [],
        invoices: invoicesRes.data || [],
        payments: paymentsRes.data || [],
      },
    });
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      };
    }
    return {
      ok: false,
      error_code: "SETTLEMENT_READ_FAILED",
      error_message: "決済条件の取得に失敗しました",
    };
  }
}
