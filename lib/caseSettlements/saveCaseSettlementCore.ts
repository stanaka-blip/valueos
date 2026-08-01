import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import {
  buildSettlementSavePatch,
  type SettlementSaveBody,
  type SettlementSaveFieldErrors,
  type SettlementSavePatch,
} from "./settlementSaveLogic";
import { settlementRowMatchesPatch } from "./settlementVerify";

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
  const { data, error, count } = await client
    .from("case_settlements")
    .select("*", { count: "exact" })
    .eq("case_id", caseId);

  if (error) {
    return {
      ok: false as const,
      error_code: "SETTLEMENT_SAVE_FAILED" as const,
      error_message: "決済条件を保存できませんでした",
    };
  }

  const rows = data ?? [];
  if ((count ?? rows.length) > 1 || rows.length > 1) {
    return {
      ok: false as const,
      error_code: "SETTLEMENT_SAVE_FAILED" as const,
      error_message: "決済条件を保存できませんでした",
    };
  }

  return { ok: true as const, data: rows[0] ?? null };
}

async function verifyPersisted(
  client: SupabaseClient<Database>,
  caseId: string,
  expectedId: string,
  patch: SettlementSavePatch
): Promise<SaveCaseSettlementResult | { ok: true; settlement_id: string }> {
  const { data, error } = await client
    .from("case_settlements")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      error_code: "SETTLEMENT_SAVE_FAILED",
      error_message: "決済条件を保存できませんでした",
    };
  }

  if (data.id !== expectedId) {
    return {
      ok: false,
      error_code: "SETTLEMENT_SAVE_FAILED",
      error_message: "決済条件を保存できませんでした",
    };
  }

  if (!settlementRowMatchesPatch(data, patch)) {
    return {
      ok: false,
      error_code: "SETTLEMENT_SAVE_FAILED",
      error_message: "決済条件を保存できませんでした",
    };
  }

  return { ok: true, settlement_id: data.id };
}

/**
 * case_id 単位で INSERT/UPDATE（注入クライアント）。
 * 書き込み後に同一 case_id を再SELECTし、内容一致を確認してから成功とする。
 */
export async function saveCaseSettlementByCaseIdWithClient(
  caseId: string,
  body: SettlementSaveBody,
  client: SupabaseClient<Database>
): Promise<SaveCaseSettlementResult> {
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
      .eq("case_id", caseId)
      .select("id")
      .single();

    if (error || !data?.id) {
      return {
        ok: false,
        error_code: "SETTLEMENT_SAVE_FAILED",
        error_message: "決済条件を保存できませんでした",
      };
    }

    const verified = await verifyPersisted(
      client,
      caseId,
      data.id,
      built.patch
    );
    if (!verified.ok) return verified;

    return {
      ok: true,
      settlement_id: verified.settlement_id,
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

  if (error || !data?.id) {
    return {
      ok: false,
      error_code: "SETTLEMENT_SAVE_FAILED",
      error_message: "決済条件を保存できませんでした",
    };
  }

  const verified = await verifyPersisted(client, caseId, data.id, built.patch);
  if (!verified.ok) return verified;

  return {
    ok: true,
    settlement_id: verified.settlement_id,
    created: true,
    patch: built.patch,
  };
}
