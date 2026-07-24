import type { CaseSettlementRow } from "@/lib/database.types";

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
};

export function toSettlementViewData(
  row: CaseSettlementRow
): SettlementViewData {
  return {
    id: row.id,
    settlementType: row.settlement_type,
    feeRate: row.fee_rate,
    feeAmount: row.fee_amount ?? 0,
    depositRate: row.deposit_rate,
    depositAmount: row.deposit_amount,
    paymentTerms: row.payment_terms || "",
    cardBrand: row.card_brand || "",
    memo: row.memo || "",
  };
}
