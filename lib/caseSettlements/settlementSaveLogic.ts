import {
  CASE_SETTLEMENT_TYPES,
  type CaseSettlementType,
} from "@/lib/caseSettlementTypes";
import type { CaseSettlementRow } from "@/lib/database.types";
import {
  resolveSettlementDetailColumns,
  validateSettlementDetailFields,
} from "@/app/cases/[id]/settlementView";
import { CARD_STATUSES, LOAN_STATUSES } from "@/lib/workflow";

export type SettlementSaveSource = "settlement_form" | "workflow_panel";

export type SettlementSaveBody = {
  source: SettlementSaveSource;
  settlement_type?: unknown;
  fee_rate?: unknown;
  fee_amount?: unknown;
  deposit_rate?: unknown;
  deposit_amount?: unknown;
  payment_terms?: unknown;
  memo?: unknown;
  finance_company?: unknown;
  approval_number?: unknown;
  card_brand?: unknown;
  loan_status?: unknown;
  card_status?: unknown;
  loan_status_updated_at?: unknown;
  card_status_updated_at?: unknown;
  /** false のとき loan/card status 列は既存維持（memo フォールバック用） */
  update_status_columns?: unknown;
};

export type SettlementSaveFieldErrors = {
  finance_company?: string;
  approval_number?: string;
  card_brand?: string;
  settlement_type?: string;
  form?: string;
};

export type SettlementSavePatch = {
  settlement_type: string;
  fee_rate: number | null;
  fee_amount: number;
  deposit_rate: number | null;
  deposit_amount: number | null;
  payment_terms: string | null;
  memo: string | null;
  finance_company: string | null;
  approval_number: string | null;
  card_brand: string | null;
  loan_status: string | null;
  card_status: string | null;
  loan_status_updated_at?: string | null;
  card_status_updated_at?: string | null;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Number.NaN;
  }
  return value;
}

function isSettlementType(value: string): value is CaseSettlementType {
  return (CASE_SETTLEMENT_TYPES as readonly string[]).includes(value);
}

function isLoanStatus(value: string): boolean {
  return (LOAN_STATUSES as readonly string[]).includes(value);
}

function isCardStatus(value: string): boolean {
  return (CARD_STATUSES as readonly string[]).includes(value);
}

/**
 * リクエスト本文と既存行から upsert パッチを組み立てる（DB非依存）。
 * - settlement_form: 区分・詳細・fee等を保存。loan/card status は既存維持
 * - workflow_panel: status のみ更新。区分・詳細・fee等は既存維持
 */
export function buildSettlementSavePatch(
  body: SettlementSaveBody,
  existing: CaseSettlementRow | null
):
  | { ok: true; patch: SettlementSavePatch }
  | { ok: false; error_code: "INVALID_INPUT"; error_message: string; field_errors?: SettlementSaveFieldErrors } {
  if (body.source !== "settlement_form" && body.source !== "workflow_panel") {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
      field_errors: { form: "source が不正です" },
    };
  }

  if (body.source === "workflow_panel") {
    if (!existing) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "先に決済区分を保存してください",
      };
    }

    const updateStatusColumns = body.update_status_columns !== false;
    const loanStatus = asTrimmedString(body.loan_status);
    const cardStatus = asTrimmedString(body.card_status);
    if (updateStatusColumns && loanStatus && !isLoanStatus(loanStatus)) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "ローンステータスが不正です",
      };
    }
    if (updateStatusColumns && cardStatus && !isCardStatus(cardStatus)) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "カードステータスが不正です",
      };
    }

    const now =
      typeof body.loan_status_updated_at === "string" &&
      body.loan_status_updated_at.trim()
        ? body.loan_status_updated_at.trim()
        : new Date().toISOString();

    const memo =
      body.memo === undefined
        ? existing.memo
        : typeof body.memo === "string"
          ? body.memo.trim() || null
          : null;

    if (!updateStatusColumns) {
      return {
        ok: true,
        patch: {
          settlement_type: existing.settlement_type,
          fee_rate: existing.fee_rate,
          fee_amount: existing.fee_amount ?? 0,
          deposit_rate: existing.deposit_rate,
          deposit_amount: existing.deposit_amount,
          payment_terms: existing.payment_terms,
          memo,
          finance_company: existing.finance_company,
          approval_number: existing.approval_number,
          card_brand: existing.card_brand,
          loan_status: existing.loan_status,
          card_status: existing.card_status,
        },
      };
    }

    return {
      ok: true,
      patch: {
        settlement_type: existing.settlement_type,
        fee_rate: existing.fee_rate,
        fee_amount: existing.fee_amount ?? 0,
        deposit_rate: existing.deposit_rate,
        deposit_amount: existing.deposit_amount,
        payment_terms: existing.payment_terms,
        memo,
        finance_company: existing.finance_company,
        approval_number: existing.approval_number,
        card_brand: existing.card_brand,
        loan_status: loanStatus || null,
        card_status: cardStatus || null,
        loan_status_updated_at: now,
        card_status_updated_at: now,
      },
    };
  }

  // settlement_form
  const settlementType = asTrimmedString(body.settlement_type);
  if (!settlementType || !isSettlementType(settlementType)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "決済区分が不正です",
      field_errors: { settlement_type: "決済区分は必須です" },
    };
  }

  const feeRate = asOptionalNumber(body.fee_rate);
  const feeAmount = asOptionalNumber(body.fee_amount);
  const depositRate = asOptionalNumber(body.deposit_rate);
  const depositAmount = asOptionalNumber(body.deposit_amount);
  if (
    (feeRate !== undefined && Number.isNaN(feeRate)) ||
    (feeAmount !== undefined && Number.isNaN(feeAmount)) ||
    (depositRate !== undefined && Number.isNaN(depositRate)) ||
    (depositAmount !== undefined && Number.isNaN(depositAmount))
  ) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "数値の形式が正しくありません",
    };
  }

  const detailInput = {
    financeCompany:
      typeof body.finance_company === "string" ? body.finance_company : "",
    approvalNumber:
      typeof body.approval_number === "string" ? body.approval_number : "",
    cardBrand: typeof body.card_brand === "string" ? body.card_brand : "",
  };

  const fieldErrors = validateSettlementDetailFields(
    settlementType,
    detailInput
  );
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
      field_errors: fieldErrors,
    };
  }

  const existingDetail = existing
    ? {
        financeCompany: existing.finance_company || "",
        approvalNumber: existing.approval_number || "",
        cardBrand: existing.card_brand || "",
      }
    : null;

  const detailColumns = resolveSettlementDetailColumns(
    settlementType,
    detailInput,
    existingDetail
  );

  return {
    ok: true,
    patch: {
      settlement_type: settlementType,
      fee_rate: feeRate ?? null,
      fee_amount: feeAmount ?? 0,
      deposit_rate: depositRate ?? null,
      deposit_amount: depositAmount ?? null,
      payment_terms:
        typeof body.payment_terms === "string"
          ? body.payment_terms.trim() || null
          : null,
      memo:
        typeof body.memo === "string" ? body.memo.trim() || null : null,
      ...detailColumns,
      // SettlementForm では workflow status を消さない
      loan_status: existing?.loan_status ?? null,
      card_status: existing?.card_status ?? null,
    },
  };
}
