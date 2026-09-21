import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 案件登録 RPC クライアント。
 *
 * lines[].supplier_id / purchase_price / sales_price（単価）/ is_manual_price を渡し、
 * RPC が case_products に snapshot 保存する（未指定は NULL 可。0円可。
 * is_manual_price は手入力メタで reject しない）。
 */

export type CaseRegistrationLineInput = {
  line_type: "PRODUCT" | "PACKAGE";
  product_id?: string | null;
  package_id?: string | null;
  supplier_id?: string | null;
  quantity: number;
  memo?: string | null;
  display_name?: string | null;
  /** 仕入単価。RPC 側で数量乗算して snapshot */
  purchase_price?: number | null;
  /** 販売単価。RPC 側で数量乗算して snapshot */
  sales_price?: number | null;
  is_manual_price?: boolean;
};

export type CaseRegistrationPayload = {
  request_id: string;
  case: {
    dealer_id: string;
    customer_name: string;
    site_address: string;
    order_received_date: string;
    case_no?: string | null;
    customer_phone?: string | null;
    order_type?: string | null;
    desired_delivery_date?: string | null;
    delivery_address?: string | null;
    construction_desired_date?: string | null;
    construction_detail?: string | null;
    assigned_user?: string | null;
    memo?: string | null;
  };
  settlement: {
    settlement_type: string;
    finance_company?: string | null;
    approval_number?: string | null;
    card_brand?: string | null;
  };
  lines: CaseRegistrationLineInput[];
};

export type CaseRegistrationRpcResult = {
  ok: boolean;
  status: "COMPLETED" | "FAILED" | "PROCESSING" | string;
  request_id?: string;
  case_id?: string | null;
  case_no?: string | null;
  idempotent_replay?: boolean;
  error_code?: string;
  error_message?: string;
};

export async function createCaseRegistration(
  client: SupabaseClient,
  payload: CaseRegistrationPayload
): Promise<CaseRegistrationRpcResult> {
  const { data, error } = await client.rpc("create_case_registration", {
    payload,
  });

  if (error) {
    return {
      ok: false,
      status: "FAILED",
      request_id: payload.request_id,
      error_code: "RPC_ERROR",
      error_message: error.message,
      idempotent_replay: false,
    };
  }

  return (data || {
    ok: false,
    status: "FAILED",
    error_code: "EMPTY_RESPONSE",
    error_message: "RPC returned empty response",
  }) as CaseRegistrationRpcResult;
}
