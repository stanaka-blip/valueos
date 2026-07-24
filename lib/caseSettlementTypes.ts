/** Ver1.0 決済区分（画面・Repository共通）。型再生成の対象外。 */
export const CASE_SETTLEMENT_TYPES = [
  "三社間決済",
  "前金",
  "掛売",
  "カード",
  "その他",
] as const;

export type CaseSettlementType = (typeof CASE_SETTLEMENT_TYPES)[number];
