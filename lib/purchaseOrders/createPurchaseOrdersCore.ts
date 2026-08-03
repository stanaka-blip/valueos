import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  buildCreatePurchaseOrdersRpcPayload,
  validateCreatePurchaseOrdersBody,
  type CreatePurchaseOrdersBody,
  type PurchaseOrderFieldErrors,
} from "./createPurchaseOrdersLogic";

export type CreatedPurchaseOrder = {
  id: string;
  order_no: string;
  supplier_id: string;
  order_amount: number;
  item_count: number;
};

export type CreatePurchaseOrdersResult =
  | {
      ok: true;
      request_id: string;
      case_id: string;
      orders: CreatedPurchaseOrder[];
      idempotent_replay: boolean;
    }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFIG_ERROR"
        | "DUPLICATE_ORDER_NO"
        | "REQUEST_ID_CONFLICT"
        | "REQUEST_IN_PROGRESS"
        | "ORDER_CREATE_FAILED";
      error_message: string;
      field_errors?: PurchaseOrderFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
  status?: unknown;
  request_id?: unknown;
  case_id?: unknown;
  orders?: unknown;
  idempotent_replay?: unknown;
  error_code?: unknown;
  error_message?: unknown;
};

const ALLOWED_RPC_ERRORS = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "DUPLICATE_ORDER_NO",
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "ORDER_CREATE_FAILED",
]);

function parseCreatedOrders(raw: unknown): CreatedPurchaseOrder[] {
  if (!Array.isArray(raw)) return [];
  const out: CreatedPurchaseOrder[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const order_no = typeof r.order_no === "string" ? r.order_no : "";
    const supplier_id = typeof r.supplier_id === "string" ? r.supplier_id : "";
    const order_amount = Number(r.order_amount);
    const item_count = Number(r.item_count);
    if (!id || !order_no || !supplier_id) continue;
    out.push({
      id,
      order_no,
      supplier_id,
      order_amount: Number.isFinite(order_amount) ? order_amount : 0,
      item_count: Number.isFinite(item_count) ? item_count : 0,
    });
  }
  return out;
}

export async function createPurchaseOrdersWithClient(
  caseId: string,
  requestId: string,
  body: CreatePurchaseOrdersBody | Record<string, unknown>,
  client: AdminClient
): Promise<CreatePurchaseOrdersResult> {
  const validated = validateCreatePurchaseOrdersBody(body);
  if (!validated.ok) {
    return validated;
  }

  const payload = buildCreatePurchaseOrdersRpcPayload(
    caseId,
    requestId,
    validated.value
  );

  const { data, error } = await client.rpc("create_purchase_orders", {
    payload: payload as Json,
  });

  if (error) {
    console.warn("[createPurchaseOrders] RPC error:", error.message);
    return {
      ok: false,
      error_code: "ORDER_CREATE_FAILED",
      error_message: "発注を登録できませんでした",
      request_id: requestId,
    };
  }

  const raw = (data || {}) as RpcRaw;
  if (raw.ok === true) {
    const orders = parseCreatedOrders(raw.orders);
    if (orders.length === 0) {
      return {
        ok: false,
        error_code: "ORDER_CREATE_FAILED",
        error_message: "発注を登録できませんでした",
        request_id: requestId,
      };
    }
    return {
      ok: true,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : requestId,
      case_id: typeof raw.case_id === "string" ? raw.case_id : caseId,
      orders,
      idempotent_replay: raw.idempotent_replay === true,
    };
  }

  const errorCode =
    typeof raw.error_code === "string" && ALLOWED_RPC_ERRORS.has(raw.error_code)
      ? (raw.error_code as
          | "INVALID_INPUT"
          | "NOT_FOUND"
          | "DUPLICATE_ORDER_NO"
          | "REQUEST_ID_CONFLICT"
          | "REQUEST_IN_PROGRESS"
          | "ORDER_CREATE_FAILED")
      : "ORDER_CREATE_FAILED";

  return {
    ok: false,
    error_code: errorCode,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "発注を登録できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
