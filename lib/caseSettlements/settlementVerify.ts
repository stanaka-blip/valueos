import type { CaseSettlementRow } from "@/lib/database.types";

import type { SettlementSavePatch } from "./settlementSaveLogic";

function normText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normNum(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return value;
}

/**
 * 保存パッチと再SELECT行の一致判定（false なら success を返してはならない）。
 */
export function settlementRowMatchesPatch(
  row: CaseSettlementRow,
  patch: SettlementSavePatch
): boolean {
  if (row.settlement_type !== patch.settlement_type) return false;
  if (normText(row.finance_company) !== normText(patch.finance_company)) {
    return false;
  }
  if (normText(row.approval_number) !== normText(patch.approval_number)) {
    return false;
  }
  if (normText(row.card_brand) !== normText(patch.card_brand)) return false;
  if (normNum(row.fee_rate) !== normNum(patch.fee_rate)) return false;
  if ((row.fee_amount ?? 0) !== (patch.fee_amount ?? 0)) return false;
  if (normNum(row.deposit_rate) !== normNum(patch.deposit_rate)) return false;
  if (normNum(row.deposit_amount) !== normNum(patch.deposit_amount)) {
    return false;
  }
  if (normText(row.payment_terms) !== normText(patch.payment_terms)) {
    return false;
  }
  if (normText(row.memo) !== normText(patch.memo)) return false;
  if (normText(row.loan_status) !== normText(patch.loan_status)) return false;
  if (normText(row.card_status) !== normText(patch.card_status)) return false;
  return true;
}
