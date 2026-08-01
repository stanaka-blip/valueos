import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  buildSettlementSavePatch,
  type SettlementSaveBody,
  type SettlementSaveFieldErrors,
  type SettlementSavePatch,
} from "./settlementSaveLogic";

export type SaveCaseSettlementResult =
  | {
      ok: true;
      settlement_id: string;
      created: boolean;
      patch: SettlementSavePatch;
    }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFIG_ERROR"
        | "SETTLEMENT_SAVE_FAILED";
      error_message: string;
      field_errors?: SettlementSaveFieldErrors;
    };

async function loadExisting(
  client: SupabaseClient<Database>,
  caseId: string
) {
  const { data, error } = await client
    .from("case_settlements")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      error_code: "SETTLEMENT_SAVE_FAILED" as const,
      error_message: "決済条件を保存できませんでした",
    };
  }
  return { ok: true as const, data: data ?? null };
}

/**
 * case_id 単位で INSERT/UPDATE。service role クライアント必須。
 */
export async function saveCaseSettlementByCaseId(
  caseId: string,
  body: SettlementSaveBody,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<SaveCaseSettlementResult> {
  try {
    const caseLookup = await client
      .from("cases")
      .select("id")
      .eq("id", caseId)
      .maybeSingle();

    if (caseLookup.error) {
      return {
        ok: false,
        error_code: "SETTLEMENT_SAVE_FAILED",
        error_message: "決済条件を保存できませんでした",
      };
    }
    if (!caseLookup.data) {
      return {
        ok: false,
        error_code: "NOT_FOUND",
        error_message: "案件が見つかりません",
      };
    }

    const existingResult = await loadExisting(client, caseId);
    if (!existingResult.ok) return existingResult;

    const built = buildSettlementSavePatch(body, existingResult.data);
    if (!built.ok) return built;

    if (existingResult.data) {
      const { data, error } = await client
        .from("case_settlements")
        .update(built.patch)
        .eq("id", existingResult.data.id)
        .select("id")
        .single();

      if (error || !data) {
        return {
          ok: false,
          error_code: "SETTLEMENT_SAVE_FAILED",
          error_message: "決済条件を保存できませんでした",
        };
      }
      return {
        ok: true,
        settlement_id: data.id,
        created: false,
        patch: built.patch,
      };
    }

    const { data, error } = await client
      .from("case_settlements")
      .insert({
        case_id: caseId,
        ...built.patch,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error_code: "SETTLEMENT_SAVE_FAILED",
        error_message: "決済条件を保存できませんでした",
      };
    }

    return {
      ok: true,
      settlement_id: data.id,
      created: true,
      patch: built.patch,
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      };
    }
    return {
      ok: false,
      error_code: "SETTLEMENT_SAVE_FAILED",
      error_message: "決済条件を保存できませんでした",
    };
  }
}
