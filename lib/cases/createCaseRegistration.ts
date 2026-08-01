import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 案件登録 RPC クライアント（UI未接続。PR3 で /cases/new から利用予定）。
 *
 * ## payload JSON Schema（相当）
 *
 * ```json
 * {
 *   "request_id": "uuid",                 // 必須。冪等キー
 *   "case": {
 *     "dealer_id": "uuid",                // 必須
 *     "customer_name": "string",          // 必須
 *     "site_address": "string",           // 必須
 *     "order_received_date": "YYYY-MM-DD",// 必須。価格基準日
 *     "case_no": "string|null",
 *     "customer_phone": "string|null",
 *     "order_type": "string|null",
 *     "desired_delivery_date": "YYYY-MM-DD|null",
 *     "delivery_address": "string|null",
 *     "construction_desired_date": "YYYY-MM-DD|null",
 *     "construction_detail": "string|null",
 *     "assigned_user": "string|null",
 *     "memo": "string|null"
 *   },
 *   "settlement": {
 *     "settlement_type": "string"         // 必須
 *   },
 *   "lines": [
 *     {
 *       "line_type": "PRODUCT"|"PACKAGE",
 *       "product_id": "uuid|null",        // PRODUCT時必須
 *       "package_id": "uuid|null",        // PACKAGE時必須
 *       "supplier_id": "uuid|null",       // 任意（後方互換）。登録時は保存しない
 *       "quantity": number,               // 1..9999 整数
 *       "memo": "string|null",
 *       "display_name": "string|null"
 *     }
 *   ]
 * }
 * ```
 *
 * 仕入先・販売/仕入価格・価格ID・粗利は登録時に保存しない（NULL）。
 * 旧payloadの supplier_id は無視して成功する（後方互換）。
 * is_manual_price はクライアント入力として採用しない。
 * service role key は渡さない（publishable/anon クライアントのみ）。
 */

export type CaseRegistrationLineInput = {
  line_type: "PRODUCT" | "PACKAGE";
  product_id?: string | null;
  package_id?: string | null;
  /** 後方互換用。RPCは登録時に保存しない */
  supplier_id?: string | null;
  quantity: number;
  memo?: string | null;
  display_name?: string | null;
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
