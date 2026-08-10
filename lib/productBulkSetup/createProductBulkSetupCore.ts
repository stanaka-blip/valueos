import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  buildCreateProductBulkSetupRpcPayload,
  validateCreateProductBulkSetupBody,
  type CreateProductBulkSetupBody,
  type ProductBulkFieldErrors,
} from "./createProductBulkSetupLogic";

export type CreateProductBulkSetupResult =
  | {
      ok: true;
      request_id: string;
      manufacturer_id: string;
      series_id: string | null;
      category: string | null;
      product_ids: string[];
      product_count: number;
      idempotent_replay: boolean;
    }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "DUPLICATE_PRODUCT"
        | "CONFIG_ERROR"
        | "REQUEST_ID_CONFLICT"
        | "REQUEST_IN_PROGRESS"
        | "PRODUCT_BULK_SETUP_FAILED";
      error_message: string;
      field_errors?: ProductBulkFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
  request_id?: unknown;
  manufacturer_id?: unknown;
  series_id?: unknown;
  category?: unknown;
  product_ids?: unknown;
  product_count?: unknown;
  idempotent_replay?: unknown;
  error_code?: unknown;
  error_message?: unknown;
};

const ALLOWED = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "DUPLICATE_PRODUCT",
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "PRODUCT_BULK_SETUP_FAILED",
]);

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export async function createProductBulkSetupWithClient(
  requestId: string,
  body: CreateProductBulkSetupBody | Record<string, unknown>,
  client: AdminClient
): Promise<CreateProductBulkSetupResult> {
  const validated = validateCreateProductBulkSetupBody(body);
  if (!validated.ok) return validated;

  const payload = buildCreateProductBulkSetupRpcPayload(
    requestId,
    validated.value
  );

  const { data, error } = await client.rpc(
    "create_product_bulk_setup" as never,
    {
      payload: payload as Json,
    } as never
  );

  if (error) {
    console.warn("[createProductBulkSetup] RPC error:", error.message);
    return {
      ok: false,
      error_code: "PRODUCT_BULK_SETUP_FAILED",
      error_message: "商品を一括登録できませんでした",
      request_id: requestId,
    };
  }

  const raw = (data || {}) as RpcRaw;
  if (raw.ok === true) {
    const manufacturer_id =
      typeof raw.manufacturer_id === "string" ? raw.manufacturer_id : "";
    const ids = parseIdList(raw.product_ids);
    if (!manufacturer_id || ids.length === 0) {
      return {
        ok: false,
        error_code: "PRODUCT_BULK_SETUP_FAILED",
        error_message: "商品を一括登録できませんでした",
        request_id: requestId,
      };
    }
    return {
      ok: true,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : requestId,
      manufacturer_id,
      series_id: typeof raw.series_id === "string" ? raw.series_id : null,
      category: typeof raw.category === "string" ? raw.category : null,
      product_ids: ids,
      product_count:
        typeof raw.product_count === "number" ? raw.product_count : ids.length,
      idempotent_replay: raw.idempotent_replay === true,
    };
  }

  type FailCode = Exclude<CreateProductBulkSetupResult, { ok: true }>["error_code"];
  const errorCode: FailCode =
    typeof raw.error_code === "string" && ALLOWED.has(raw.error_code)
      ? (raw.error_code as FailCode)
      : "PRODUCT_BULK_SETUP_FAILED";

  return {
    ok: false,
    error_code: errorCode,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "商品を一括登録できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
