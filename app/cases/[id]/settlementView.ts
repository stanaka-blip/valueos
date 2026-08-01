import type { CaseSettlementRow } from "@/lib/database.types";
import {
  parseWorkflowMeta,
  stripWorkflowMeta,
} from "@/lib/workflow/workflowMeta";

export type SettlementViewData = {
  id: string;
  settlementType: string;
  feeRate: number | null;
  feeAmount: number;
  depositRate: number | null;
  depositAmount: number | null;
  paymentTerms: string;
  cardBrand: string;
  financeCompany: string;
  approvalNumber: string;
  memo: string;
  loanStatus: string;
  cardStatus: string;
  /** memo フォールバック由来の完工日（カラム未適用時） */
  constructionCompletedDateFromMeta: string;
};

export function toSettlementViewData(
  row: CaseSettlementRow
): SettlementViewData {
  const meta = parseWorkflowMeta(row.memo);
  return {
    id: row.id,
    settlementType: row.settlement_type,
    feeRate: row.fee_rate,
    feeAmount: row.fee_amount ?? 0,
    depositRate: row.deposit_rate,
    depositAmount: row.deposit_amount,
    paymentTerms: row.payment_terms || "",
    cardBrand: row.card_brand || "",
    financeCompany: row.finance_company || "",
    approvalNumber: row.approval_number || "",
    memo: stripWorkflowMeta(row.memo) || "",
    loanStatus: row.loan_status || meta.loan_status || "",
    cardStatus: row.card_status || meta.card_status || "",
    constructionCompletedDateFromMeta:
      meta.construction_completed_date || "",
  };
}

/** 区分別の決済詳細列（finance / approval / card_brand）のクリア方針付き解決 */
export type SettlementDetailInput = {
  financeCompany: string;
  approvalNumber: string;
  cardBrand: string;
};

/**
 * 区分変更時の詳細列クリア方針:
 * - 3社間決済: finance/approval を保存。card_brand は null
 * - カード: card_brand を保存。finance/approval は null
 * - 前金 / 売掛: 3詳細列すべて null（当該区分では未使用）
 * - その他: 既存値を維持（変換・削除しない）。フォーム入力では上書きしない
 */
export function resolveSettlementDetailColumns(
  settlementType: string,
  input: SettlementDetailInput,
  existing: SettlementDetailInput | null
): {
  finance_company: string | null;
  approval_number: string | null;
  card_brand: string | null;
} {
  if (settlementType === "3社間決済") {
    return {
      finance_company: input.financeCompany.trim() || null,
      approval_number: input.approvalNumber.trim() || null,
      card_brand: null,
    };
  }

  if (settlementType === "カード") {
    return {
      finance_company: null,
      approval_number: null,
      card_brand: input.cardBrand.trim() || null,
    };
  }

  if (settlementType === "その他") {
    return {
      finance_company: existing?.financeCompany.trim() || null,
      approval_number: existing?.approvalNumber.trim() || null,
      card_brand: existing?.cardBrand.trim() || null,
    };
  }

  // 前金 / 売掛 / その他以外の未知区分: 詳細列はクリア
  return {
    finance_company: null,
    approval_number: null,
    card_brand: null,
  };
}

/** 案件登録 UI と同値 */
export const MAX_CASE_SETTLEMENT_DETAIL_LEN = 500;

export type SettlementDetailErrors = {
  finance_company?: string;
  approval_number?: string;
  card_brand?: string;
};

/** 案件詳細 SettlementForm 用の区分別必須チェック */
export function validateSettlementDetailFields(
  settlementType: string,
  input: SettlementDetailInput
): SettlementDetailErrors {
  const errors: SettlementDetailErrors = {};

  if (settlementType === "3社間決済") {
    const finance = input.financeCompany.trim();
    const approval = input.approvalNumber.trim();
    if (!finance) {
      errors.finance_company = "信販会社は必須です";
    } else if (finance.length > MAX_CASE_SETTLEMENT_DETAIL_LEN) {
      errors.finance_company = "信販会社名が長すぎます";
    }
    if (!approval) {
      errors.approval_number = "承認番号は必須です";
    } else if (approval.length > MAX_CASE_SETTLEMENT_DETAIL_LEN) {
      errors.approval_number = "承認番号が長すぎます";
    }
  }

  if (settlementType === "カード") {
    const brand = input.cardBrand.trim();
    if (!brand) {
      errors.card_brand = "カード会社名は必須です";
    } else if (brand.length > MAX_CASE_SETTLEMENT_DETAIL_LEN) {
      errors.card_brand = "カード会社名が長すぎます";
    }
  }

  return errors;
}
