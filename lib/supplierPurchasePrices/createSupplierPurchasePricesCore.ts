import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  buildCreateSupplierPurchasePricesRpcPayload,
  validateCreateSupplierPurchasePricesBody,
  type CreateSupplierPurchasePricesBody,
  type SupplierPurchasePriceFieldErrors,
} from "./createSupplierPurchasePricesLogic";

export type CreateSupplierPurchasePricesResult =
  | {
      ok: true;
      request_id: string;
      supplier_id: string;
      purchase_price_ids: string[];
      item_count: number;
      idempotent_replay: boolean;
    }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFIG_ERROR"
        | "REQUEST_ID_CONFLICT"
        | "REQUEST_IN_PROGRESS"
        | "SUPPLIER_PRICE_BULK_FAILED";
      error_message: string;
      field_errors?: SupplierPurchasePriceFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
  request_id?: unknown;
  supplier_id?: unknown;
  purchase_price_ids?: unknown;
  item_count?: unknown;
  idempotent_replay?: unknown;
  error_code?: unknown;
  error_message?: unknown;
};

const ALLOWED = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "SUPPLIER_PRICE_BULK_FAILED",
]);

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export async function createSupplierPurchasePricesWithClient(
  requestId: string,
  body: CreateSupplierPurchasePricesBody | Record<string, unknown>,
  client: AdminClient
): Promise<CreateSupplierPurchasePricesResult> {
  const validated = validateCreateSupplierPurchasePricesBody(body);
  if (!validated.ok) return validated;

  const payload = buildCreateSupplierPurchasePricesRpcPayload(
    requestId,
    validated.value
  );

  const { data, error } = await client.rpc("create_supplier_purchase_prices", {
    payload: payload as Json,
  });

  if (error) {
    console.warn("[createSupplierPurchasePrices] RPC error:", error.message);
    return {
      ok: false,
      error_code: "SUPPLIER_PRICE_BULK_FAILED",
      error_message: "仕入価格を一括登録できませんでした",
      request_id: requestId,
    };
  }

  const raw = (data || {}) as RpcRaw;
  if (raw.ok === true) {
    const supplier_id =
      typeof raw.supplier_id === "string" ? raw.supplier_id : "";
    const ids = parseIdList(raw.purchase_price_ids);
    if (!supplier_id || ids.length === 0) {
      return {
        ok: false,
        error_code: "SUPPLIER_PRICE_BULK_FAILED",
        error_message: "仕入価格を一括登録できませんでした",
        request_id: requestId,
      };
    }
    return {
      ok: true,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : requestId,
      supplier_id,
      purchase_price_ids: ids,
      item_count:
        typeof raw.item_count === "number" ? raw.item_count : ids.length,
      idempotent_replay: raw.idempotent_replay === true,
    };
  }

  const errorCode =
    typeof raw.error_code === "string" && ALLOWED.has(raw.error_code)
      ? (raw.error_code as
          | "INVALID_INPUT"
          | "NOT_FOUND"
          | "REQUEST_ID_CONFLICT"
          | "REQUEST_IN_PROGRESS"
          | "SUPPLIER_PRICE_BULK_FAILED")
      : "SUPPLIER_PRICE_BULK_FAILED";

  return {
    ok: false,
    error_code: errorCode,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "仕入価格を一括登録できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
