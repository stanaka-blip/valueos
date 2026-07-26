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
    memo: stripWorkflowMeta(row.memo) || "",
    loanStatus: row.loan_status || meta.loan_status || "",
    cardStatus: row.card_status || meta.card_status || "",
    constructionCompletedDateFromMeta:
      meta.construction_completed_date || "",
  };
}
