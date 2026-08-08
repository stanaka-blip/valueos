import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  buildCreateExistingProductPriceSetupRpcPayload,
  validateCreateExistingProductPriceSetupBody,
  type CreateExistingProductPriceSetupBody,
} from "./createExistingProductPriceSetupLogic";
import type { ProductSetupFieldErrors } from "./createProductSetupLogic";

export type CreateExistingProductPriceSetupResult =
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
        | "REQUEST_ID_CONFLICT"
        | "REQUEST_IN_PROGRESS"
        | "PRODUCT_PRICE_SETUP_FAILED";
      error_message: string;
      field_errors?: ProductSetupFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
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
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "PRODUCT_PRICE_SETUP_FAILED",
]);

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export async function createExistingProductPriceSetupWithClient(
  requestId: string,
  body: CreateExistingProductPriceSetupBody | Record<string, unknown>,
  client: AdminClient
): Promise<CreateExistingProductPriceSetupResult> {
  const validated = validateCreateExistingProductPriceSetupBody(body);
  if (!validated.ok) {
    return validated;
  }

  const payload = buildCreateExistingProductPriceSetupRpcPayload(
    requestId,
    validated.value
  );

  const { data, error } = await client.rpc(
    "create_existing_product_price_setup",
    {
      payload: payload as Json,
    }
  );

  if (error) {
    console.warn(
      "[createExistingProductPriceSetup] RPC error:",
      error.message
    );
    return {
      ok: false,
      error_code: "PRODUCT_PRICE_SETUP_FAILED",
      error_message: "価格セットアップを登録できませんでした",
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
        error_code: "PRODUCT_PRICE_SETUP_FAILED",
        error_message: "価格セットアップを登録できませんでした",
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
          | "REQUEST_ID_CONFLICT"
          | "REQUEST_IN_PROGRESS"
          | "PRODUCT_PRICE_SETUP_FAILED")
      : "PRODUCT_PRICE_SETUP_FAILED";

  return {
    ok: false,
    error_code: errorCode,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "価格セットアップを登録できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
