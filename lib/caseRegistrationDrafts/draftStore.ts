/**
 * 案件登録下書き — service_role 経由 CRUD（本人のみ）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertDraftOwner,
  buildDraftPreviewName,
  sanitizeDraftPayload,
  type CaseRegistrationDraftPayload,
  type CaseRegistrationDraftRow,
} from "./draftPayload";

function mapRow(row: Record<string, unknown>): CaseRegistrationDraftRow | null {
  const id = typeof row.id === "string" ? row.id : "";
  const created_by = typeof row.created_by === "string" ? row.created_by : "";
  const parsed = sanitizeDraftPayload(row.payload);
  if (!id || !created_by || !parsed.ok) return null;
  return {
    id,
    created_by,
    payload: parsed.value,
    current_step: Number(row.current_step) || parsed.value.step,
    customer_name_preview:
      typeof row.customer_name_preview === "string"
        ? row.customer_name_preview
        : null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export async function listCaseRegistrationDraftsForUser(
  client: SupabaseClient,
  userId: string
): Promise<
  | { ok: true; drafts: CaseRegistrationDraftRow[] }
  | { ok: false; error_message: string }
> {
  const { data, error } = await client
    .from("case_registration_drafts")
    .select(
      "id, created_by, payload, current_step, customer_name_preview, created_at, updated_at"
    )
    .eq("created_by", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return { ok: false, error_message: error.message };
  }

  const drafts: CaseRegistrationDraftRow[] = [];
  for (const row of data || []) {
    const mapped = mapRow(row as Record<string, unknown>);
    if (mapped) drafts.push(mapped);
  }
  return { ok: true, drafts };
}

export async function getCaseRegistrationDraftForUser(
  client: SupabaseClient,
  draftId: string,
  userId: string
): Promise<
  | { ok: true; draft: CaseRegistrationDraftRow }
  | { ok: false; error_code: "NOT_FOUND" | "FORBIDDEN"; error_message: string }
> {
  const { data, error } = await client
    .from("case_registration_drafts")
    .select(
      "id, created_by, payload, current_step, customer_name_preview, created_at, updated_at"
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      error_code: "NOT_FOUND",
      error_message: "下書きが見つかりません",
    };
  }
  if (!assertDraftOwner(data.created_by as string, userId)) {
    return {
      ok: false,
      error_code: "FORBIDDEN",
      error_message: "この下書きを開けません",
    };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) {
    return {
      ok: false,
      error_code: "NOT_FOUND",
      error_message: "下書き内容が不正です",
    };
  }
  return { ok: true, draft: mapped };
}

export async function upsertCaseRegistrationDraftForUser(
  client: SupabaseClient,
  userId: string,
  input: {
    draftId?: string | null;
    payload: unknown;
  }
): Promise<
  | { ok: true; draft: CaseRegistrationDraftRow }
  | {
      ok: false;
      error_code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "SAVE_FAILED";
      error_message: string;
    }
> {
  const parsed = sanitizeDraftPayload(input.payload);
  if (!parsed.ok) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: parsed.error_message,
    };
  }
  const payload = parsed.value;
  const preview = buildDraftPreviewName(payload.caseForm);
  const draftId = (input.draftId || "").trim() || null;

  if (draftId) {
    const existing = await getCaseRegistrationDraftForUser(
      client,
      draftId,
      userId
    );
    if (!existing.ok) {
      return {
        ok: false,
        error_code: existing.error_code,
        error_message: existing.error_message,
      };
    }
    const { data, error } = await client
      .from("case_registration_drafts")
      .update({
        payload,
        current_step: payload.step,
        customer_name_preview: preview,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("created_by", userId)
      .select(
        "id, created_by, payload, current_step, customer_name_preview, created_at, updated_at"
      )
      .single();
    if (error || !data) {
      return {
        ok: false,
        error_code: "SAVE_FAILED",
        error_message: "下書きを保存できませんでした",
      };
    }
    const mapped = mapRow(data as Record<string, unknown>);
    if (!mapped) {
      return {
        ok: false,
        error_code: "SAVE_FAILED",
        error_message: "下書きを保存できませんでした",
      };
    }
    return { ok: true, draft: mapped };
  }

  const { data, error } = await client
    .from("case_registration_drafts")
    .insert({
      created_by: userId,
      payload,
      current_step: payload.step,
      customer_name_preview: preview,
    })
    .select(
      "id, created_by, payload, current_step, customer_name_preview, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      error_code: "SAVE_FAILED",
      error_message: "下書きを保存できませんでした",
    };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) {
    return {
      ok: false,
      error_code: "SAVE_FAILED",
      error_message: "下書きを保存できませんでした",
    };
  }
  return { ok: true, draft: mapped };
}

export async function deleteCaseRegistrationDraftForUser(
  client: SupabaseClient,
  draftId: string,
  userId: string
): Promise<
  | { ok: true }
  | { ok: false; error_code: "NOT_FOUND" | "FORBIDDEN"; error_message: string }
> {
  const existing = await getCaseRegistrationDraftForUser(
    client,
    draftId,
    userId
  );
  if (!existing.ok) {
    return existing;
  }
  const { error } = await client
    .from("case_registration_drafts")
    .delete()
    .eq("id", draftId)
    .eq("created_by", userId);
  if (error) {
    return {
      ok: false,
      error_code: "NOT_FOUND",
      error_message: "下書きを削除できませんでした",
    };
  }
  return { ok: true };
}

export type { CaseRegistrationDraftPayload };
