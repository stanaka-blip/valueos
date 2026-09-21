/**
 * 案件登録下書き: payload 検証（DB非依存）。
 */

import { isUuid } from "@/lib/gateway/authCookie";

import type {
  CaseFormState,
  CaseRegistrationStepId,
  LineDraft,
  SettlementFormState,
} from "@/app/components/case-registration/types";
import {
  createEmptyLine,
  createInitialCaseForm,
  createInitialSettlementForm,
} from "@/app/components/case-registration/types";

export const MAX_DRAFT_PAYLOAD_BYTES = 400_000;
export const MAX_DRAFT_LINES = 50;

export type CaseRegistrationDraftPayload = {
  version: 1;
  step: CaseRegistrationStepId;
  caseForm: CaseFormState;
  lines: LineDraft[];
  settlement: SettlementFormState;
};

export type CaseRegistrationDraftRow = {
  id: string;
  created_by: string;
  payload: CaseRegistrationDraftPayload;
  current_step: number;
  customer_name_preview: string | null;
  created_at: string;
  updated_at: string;
};

export function buildDraftPreviewName(caseForm: CaseFormState): string {
  const name = (caseForm.customer_name || "").trim();
  return name || "（顧客名未入力）";
}

export function createEmptyDraftPayload(
  step: CaseRegistrationStepId = 1
): CaseRegistrationDraftPayload {
  return {
    version: 1,
    step,
    caseForm: createInitialCaseForm(),
    lines: [createEmptyLine()],
    settlement: createInitialSettlementForm(),
  };
}

export function sanitizeDraftPayload(
  raw: unknown
):
  | { ok: true; value: CaseRegistrationDraftPayload }
  | { ok: false; error_message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error_message: "下書き内容が不正です" };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    return { ok: false, error_message: "下書きの版が対応していません" };
  }
  const stepNum = Number(obj.step);
  if (![1, 2, 3, 4].includes(stepNum)) {
    return { ok: false, error_message: "下書きのステップが不正です" };
  }
  if (!obj.caseForm || typeof obj.caseForm !== "object") {
    return { ok: false, error_message: "案件情報が不正です" };
  }
  if (!Array.isArray(obj.lines) || obj.lines.length < 1) {
    return { ok: false, error_message: "明細が不正です" };
  }
  if (obj.lines.length > MAX_DRAFT_LINES) {
    return { ok: false, error_message: "明細数が上限を超えています" };
  }
  if (!obj.settlement || typeof obj.settlement !== "object") {
    return { ok: false, error_message: "決済情報が不正です" };
  }

  const caseForm = { ...createInitialCaseForm(), ...(obj.caseForm as object) } as CaseFormState;
  const settlement = {
    ...createInitialSettlementForm(),
    ...(obj.settlement as object),
  } as SettlementFormState;

  const lines: LineDraft[] = [];
  for (const row of obj.lines) {
    if (!row || typeof row !== "object") {
      return { ok: false, error_message: "明細が不正です" };
    }
    const base = createEmptyLine();
    const merged = { ...base, ...(row as object) } as LineDraft;
    if (!merged.local_id) merged.local_id = base.local_id;
    if (merged.line_type !== "PRODUCT" && merged.line_type !== "PACKAGE") {
      return { ok: false, error_message: "明細区分が不正です" };
    }
    lines.push(merged);
  }

  const value: CaseRegistrationDraftPayload = {
    version: 1,
    step: stepNum as CaseRegistrationStepId,
    caseForm,
    lines,
    settlement,
  };

  const size = JSON.stringify(value).length;
  if (size > MAX_DRAFT_PAYLOAD_BYTES) {
    return { ok: false, error_message: "下書きが大きすぎます" };
  }

  return { ok: true, value };
}

export function assertDraftOwner(
  createdBy: string | null | undefined,
  sessionUserId: string | null | undefined
): boolean {
  if (!createdBy || !sessionUserId) return false;
  if (!isUuid(createdBy) || !isUuid(sessionUserId)) return false;
  return createdBy === sessionUserId;
}
