/** Ver1.1 決済区分（画面・Repository共通）。型再生成の対象外。 */
export const CASE_SETTLEMENT_TYPES = [
  "前金",
  "売掛",
  "3社間決済",
  "カード",
  "その他",
] as const;

export type CaseSettlementType = (typeof CASE_SETTLEMENT_TYPES)[number];

/**
 * 案件登録RPCが受け付ける正式区分。
 * 「その他」は既存行の保持のみで、新規RPC受付対象外。
 */
export const CASE_REGISTRATION_SETTLEMENT_TYPES = [
  "前金",
  "売掛",
  "3社間決済",
  "カード",
] as const;

export type CaseRegistrationSettlementType =
  (typeof CASE_REGISTRATION_SETTLEMENT_TYPES)[number];

/** create_case_registration の settlement オブジェクト */
export type CaseRegistrationSettlementPayload = {
  settlement_type: CaseRegistrationSettlementType;
  /** 3社間決済で必須 */
  finance_company?: string | null;
  /** 3社間決済で必須 */
  approval_number?: string | null;
  /** カードで必須（カード会社名） */
  card_brand?: string | null;
};

export function isCaseRegistrationSettlementType(
  value: string | null | undefined
): value is CaseRegistrationSettlementType {
  if (!value) return false;
  return (CASE_REGISTRATION_SETTLEMENT_TYPES as readonly string[]).includes(
    value
  );
}
