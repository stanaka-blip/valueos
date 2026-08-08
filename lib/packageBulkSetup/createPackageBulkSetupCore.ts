import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  buildCreatePackageBulkSetupRpcPayload,
  validateCreatePackageBulkSetupBody,
  type CreatePackageBulkSetupBody,
  type PackageBulkFieldErrors,
} from "./createPackageBulkSetupLogic";

export type CreatePackageBulkSetupResult =
  | {
      ok: true;
      request_id: string;
      manufacturer_id: string;
      series_id: string | null;
      package_ids: string[];
      package_count: number;
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
        | "PACKAGE_BULK_SETUP_FAILED";
      error_message: string;
      field_errors?: PackageBulkFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
  request_id?: unknown;
  manufacturer_id?: unknown;
  series_id?: unknown;
  package_ids?: unknown;
  package_count?: unknown;
  idempotent_replay?: unknown;
  error_code?: unknown;
  error_message?: unknown;
};

const ALLOWED = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "PACKAGE_BULK_SETUP_FAILED",
]);

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export async function createPackageBulkSetupWithClient(
  requestId: string,
  body: CreatePackageBulkSetupBody | Record<string, unknown>,
  client: AdminClient
): Promise<CreatePackageBulkSetupResult> {
  const validated = validateCreatePackageBulkSetupBody(body);
  if (!validated.ok) return validated;

  const payload = buildCreatePackageBulkSetupRpcPayload(
    requestId,
    validated.value
  );

  const { data, error } = await client.rpc("create_package_bulk_setup", {
    payload: payload as Json,
  });

  if (error) {
    console.warn("[createPackageBulkSetup] RPC error:", error.message);
    return {
      ok: false,
      error_code: "PACKAGE_BULK_SETUP_FAILED",
      error_message: "パッケージを一括登録できませんでした",
      request_id: requestId,
    };
  }

  const raw = (data || {}) as RpcRaw;
  if (raw.ok === true) {
    const manufacturer_id =
      typeof raw.manufacturer_id === "string" ? raw.manufacturer_id : "";
    const ids = parseIdList(raw.package_ids);
    if (!manufacturer_id || ids.length === 0) {
      return {
        ok: false,
        error_code: "PACKAGE_BULK_SETUP_FAILED",
        error_message: "パッケージを一括登録できませんでした",
        request_id: requestId,
      };
    }
    return {
      ok: true,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : requestId,
      manufacturer_id,
      series_id: typeof raw.series_id === "string" ? raw.series_id : null,
      package_ids: ids,
      package_count:
        typeof raw.package_count === "number" ? raw.package_count : ids.length,
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
          | "PACKAGE_BULK_SETUP_FAILED")
      : "PACKAGE_BULK_SETUP_FAILED";

  return {
    ok: false,
    error_code: errorCode,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "パッケージを一括登録できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : requestId,
  };
}
