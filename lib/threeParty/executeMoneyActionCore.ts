/**
 * 3社間金銭アクション実行（service_role → execute_three_party_money RPC）。
 * ledger / 訂正の atomicity は DB トランザクション側で保証する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";
import {
  buildThreePartyMoneyRpcPayload,
  type MoneyActionErrorCode,
  type MoneyFieldErrors,
  type ValidatedMoneyAction,
} from "@/lib/threeParty/moneyActionsLogic";
import { financeReceiptCreateBlockReason } from "@/lib/threeParty/threePartyRecovery";

type AdminClient = SupabaseClient<Database>;

export type ExecuteMoneyActionResult =
  | {
      ok: true;
      request_id: string;
      action: string;
      case_id: string | null;
      resource_id: string;
      status: string;
      idempotent_replay: boolean;
    }
  | {
      ok: false;
      error_code: MoneyActionErrorCode;
      error_message: string;
      field_errors?: MoneyFieldErrors;
      request_id?: string;
    };

const ALLOWED_ERRORS = new Set<string>([
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "IMMUTABLE",
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "CONFIG_ERROR",
  "ACTION_FAILED",
]);

type RpcRaw = {
  ok?: unknown;
  status?: unknown;
  request_id?: unknown;
  action?: unknown;
  case_id?: unknown;
  resource_id?: unknown;
  resource_status?: unknown;
  idempotent_replay?: unknown;
  error_code?: unknown;
  error_message?: unknown;
};

export async function executeMoneyActionWithClient(
  requestId: string,
  action: ValidatedMoneyAction,
  client: AdminClient
): Promise<ExecuteMoneyActionResult> {
  // 信販入金 create: 有効な予定/入金済があれば二重登録を拒否（Migrationなし）
  if (action.action === "finance_receipt.create") {
    const { data: existing, error: existingError } = await client
      .from("finance_receipts")
      .select("id, status")
      .eq("case_id", action.case_id);
    if (existingError) {
      console.warn(
        "[executeMoneyAction] finance_receipts guard error:",
        existingError.message
      );
      return {
        ok: false,
        error_code: "ACTION_FAILED",
        error_message: "処理に失敗しました",
        request_id: requestId,
      };
    }
    const block = financeReceiptCreateBlockReason(existing || []);
    if (block) {
      return {
        ok: false,
        error_code: "CONFLICT",
        error_message: block,
        request_id: requestId,
      };
    }
  }

  const payload = buildThreePartyMoneyRpcPayload(requestId, action);

  const { data, error } = await client.rpc("execute_three_party_money", {
    payload: payload as Json,
  });

  if (error) {
    console.warn("[executeMoneyAction] RPC error:", error.message);
    return {
      ok: false,
      error_code: "ACTION_FAILED",
      error_message: "処理に失敗しました",
      request_id: requestId,
    };
  }

  const raw = (data || {}) as RpcRaw;
  if (raw.ok === true) {
    const resourceId =
      typeof raw.resource_id === "string" ? raw.resource_id : "";
    if (!resourceId) {
      return {
        ok: false,
        error_code: "ACTION_FAILED",
        error_message: "処理結果を取得できませんでした",
        request_id: requestId,
      };
    }
    return {
      ok: true,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : requestId,
      action:
        typeof raw.action === "string" ? raw.action : action.action,
      case_id: typeof raw.case_id === "string" ? raw.case_id : null,
      resource_id: resourceId,
      status:
        typeof raw.resource_status === "string"
          ? raw.resource_status
          : "COMPLETED",
      idempotent_replay: raw.idempotent_replay === true,
    };
  }

  const code =
    typeof raw.error_code === "string" && ALLOWED_ERRORS.has(raw.error_code)
      ? (raw.error_code as MoneyActionErrorCode)
      : "ACTION_FAILED";
  const message =
    typeof raw.error_message === "string" && raw.error_message.trim()
      ? raw.error_message
      : "処理に失敗しました";

  return {
    ok: false,
    error_code: code,
    error_message: message,
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
