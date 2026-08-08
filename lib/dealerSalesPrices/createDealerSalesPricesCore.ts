import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  buildCreateDealerSalesPricesRpcPayload,
  validateCreateDealerSalesPricesBody,
  type CreateDealerSalesPricesBody,
  type DealerSalesPriceFieldErrors,
} from "./createDealerSalesPricesLogic";

export type CreateDealerSalesPricesResult =
  | {
      ok: true;
      request_id: string;
      dealer_id: string;
      sales_price_ids: string[];
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
        | "DEALER_SALES_PRICE_BULK_FAILED";
      error_message: string;
      field_errors?: DealerSalesPriceFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
  request_id?: unknown;
  dealer_id?: unknown;
  sales_price_ids?: unknown;
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
  "DEALER_SALES_PRICE_BULK_FAILED",
]);

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export async function createDealerSalesPricesWithClient(
  requestId: string,
  body: CreateDealerSalesPricesBody | Record<string, unknown>,
  client: AdminClient
): Promise<CreateDealerSalesPricesResult> {
  const validated = validateCreateDealerSalesPricesBody(body);
  if (!validated.ok) return validated;

  const payload = buildCreateDealerSalesPricesRpcPayload(
    requestId,
    validated.value
  );

  const { data, error } = await client.rpc("create_dealer_sales_prices", {
    payload: payload as Json,
  });

  if (error) {
    console.warn("[createDealerSalesPrices] RPC error:", error.message);
    return {
      ok: false,
      error_code: "DEALER_SALES_PRICE_BULK_FAILED",
      error_message: "販売価格を一括登録できませんでした",
      request_id: requestId,
    };
  }

  const raw = (data || {}) as RpcRaw;
  if (raw.ok === true) {
    const dealer_id = typeof raw.dealer_id === "string" ? raw.dealer_id : "";
    const ids = parseIdList(raw.sales_price_ids);
    if (!dealer_id || ids.length === 0) {
      return {
        ok: false,
        error_code: "DEALER_SALES_PRICE_BULK_FAILED",
        error_message: "販売価格を一括登録できませんでした",
        request_id: requestId,
      };
    }
    return {
      ok: true,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : requestId,
      dealer_id,
      sales_price_ids: ids,
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
          | "DEALER_SALES_PRICE_BULK_FAILED")
      : "DEALER_SALES_PRICE_BULK_FAILED";

  return {
    ok: false,
    error_code: errorCode,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "販売価格を一括登録できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
