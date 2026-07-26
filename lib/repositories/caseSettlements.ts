import {
  CASE_SETTLEMENT_TYPES,
  type CaseSettlementType,
} from "@/lib/caseSettlementTypes";
import type {
  CaseSettlementInsert,
  CaseSettlementRow,
  CaseSettlementUpdate,
} from "@/lib/database.types";
import { getTypedSupabase } from "@/lib/supabase";

export type CaseSettlementsResult<T> = {
  data: T;
  error: string | null;
};

export { CASE_SETTLEMENT_TYPES };
export type { CaseSettlementType };

function toErrorMessage(error: { message: string } | null): string | null {
  return error?.message ?? null;
}

export function isCaseSettlementType(
  value: string | null | undefined
): value is CaseSettlementType {
  if (!value) {
    return false;
  }
  return (CASE_SETTLEMENT_TYPES as readonly string[]).includes(value);
}

/** 案件の決済条件（1件 or null） */
export async function getCaseSettlementByCaseId(
  caseId: string
): Promise<CaseSettlementsResult<CaseSettlementRow | null>> {
  const { data, error } = await getTypedSupabase()
    .from("case_settlements")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  return {
    data: data ?? null,
    error: toErrorMessage(error),
  };
}

export async function getCaseSettlementById(
  id: string
): Promise<CaseSettlementsResult<CaseSettlementRow | null>> {
  const { data, error } = await getTypedSupabase()
    .from("case_settlements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return {
    data: data ?? null,
    error: toErrorMessage(error),
  };
}

export async function insertCaseSettlement(
  input: CaseSettlementInsert
): Promise<CaseSettlementsResult<CaseSettlementRow | null>> {
  const { data, error } = await getTypedSupabase()
    .from("case_settlements")
    .insert(input)
    .select("*")
    .single();

  return {
    data: data ?? null,
    error: toErrorMessage(error),
  };
}

export async function updateCaseSettlement(
  id: string,
  patch: CaseSettlementUpdate
): Promise<CaseSettlementsResult<CaseSettlementRow | null>> {
  const { data, error } = await getTypedSupabase()
    .from("case_settlements")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  return {
    data: data ?? null,
    error: toErrorMessage(error),
  };
}

/**
 * case_id 単位で upsert（1案件1行）。
 * 既存がなければ insert、あれば update。
 */
export async function upsertCaseSettlementByCaseId(
  caseId: string,
  input: Omit<CaseSettlementInsert, "case_id">
): Promise<CaseSettlementsResult<CaseSettlementRow | null>> {
  const existing = await getCaseSettlementByCaseId(caseId);
  if (existing.error) {
    return existing;
  }

  if (existing.data) {
    return updateCaseSettlement(existing.data.id, input);
  }

  return insertCaseSettlement({
    ...input,
    case_id: caseId,
  });
}

export async function deleteCaseSettlement(
  id: string
): Promise<CaseSettlementsResult<null>> {
  const { error } = await getTypedSupabase()
    .from("case_settlements")
    .delete()
    .eq("id", id);

  return {
    data: null,
    error: toErrorMessage(error),
  };
}

export async function deleteCaseSettlementByCaseId(
  caseId: string
): Promise<CaseSettlementsResult<null>> {
  const { error } = await getTypedSupabase()
    .from("case_settlements")
    .delete()
    .eq("case_id", caseId);

  return {
    data: null,
    error: toErrorMessage(error),
  };
}
