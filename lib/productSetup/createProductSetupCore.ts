import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  buildCreateProductSetupRpcPayload,
  validateCreateProductSetupBody,
  type CreateProductSetupBody,
  type ProductSetupFieldErrors,
} from "./createProductSetupLogic";

export type CreateProductSetupResult =
  | {
      ok: true;
      request_id: string;
      product_id: string;
      purchase_price_ids: string[];
      sales_price_ids: string[];
      idempotent_replay: boolean;
    }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFIG_ERROR"
        | "DUPLICATE_PRODUCT"
        | "REQUEST_ID_CONFLICT"
        | "REQUEST_IN_PROGRESS"
        | "PRODUCT_SETUP_FAILED";
      error_message: string;
      field_errors?: ProductSetupFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
  status?: unknown;
  request_id?: unknown;
  product_id?: unknown;
  purchase_price_ids?: unknown;
  sales_price_ids?: unknown;
  idempotent_replay?: unknown;
  error_code?: unknown;
  error_message?: unknown;
};

const ALLOWED_RPC_ERRORS = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "DUPLICATE_PRODUCT",
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "PRODUCT_SETUP_FAILED",
]);

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export async function createProductSetupWithClient(
  requestId: string,
  body: CreateProductSetupBody | Record<string, unknown>,
  client: AdminClient
): Promise<CreateProductSetupResult> {
  const validated = validateCreateProductSetupBody(body);
  if (!validated.ok) {
    return validated;
  }

  const payload = buildCreateProductSetupRpcPayload(requestId, validated.value);

  const { data, error } = await client.rpc("create_product_setup", {
    payload: payload as Json,
  });

  if (error) {
    console.warn("[createProductSetup] RPC error:", error.message);
    return {
      ok: false,
      error_code: "PRODUCT_SETUP_FAILED",
      error_message: "商品セットアップを登録できませんでした",
      request_id: requestId,
    };
  }

  const raw = (data || {}) as RpcRaw;
  if (raw.ok === true) {
    const product_id =
      typeof raw.product_id === "string" ? raw.product_id : "";
    if (!product_id) {
      return {
        ok: false,
        error_code: "PRODUCT_SETUP_FAILED",
        error_message: "商品セットアップを登録できませんでした",
        request_id: requestId,
      };
    }
    return {
      ok: true,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : requestId,
      product_id,
      purchase_price_ids: parseIdList(raw.purchase_price_ids),
      sales_price_ids: parseIdList(raw.sales_price_ids),
      idempotent_replay: raw.idempotent_replay === true,
    };
  }

  const errorCode =
    typeof raw.error_code === "string" && ALLOWED_RPC_ERRORS.has(raw.error_code)
      ? (raw.error_code as
          | "INVALID_INPUT"
          | "NOT_FOUND"
          | "DUPLICATE_PRODUCT"
          | "REQUEST_ID_CONFLICT"
          | "REQUEST_IN_PROGRESS"
          | "PRODUCT_SETUP_FAILED")
      : "PRODUCT_SETUP_FAILED";

  return {
    ok: false,
    error_code: errorCode,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "商品セットアップを登録できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
