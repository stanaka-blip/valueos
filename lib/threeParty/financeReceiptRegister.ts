/**
 * 3社間信販入金の1ステップ登録（Migrationなし）。
 *
 * DB/RPC は従来どおり create(予定) + confirm(入金済)。
 * UI からは実入金日・実入金額だけを渡し、scheduled_* に写してから確定する。
 */

export type FinanceReceiptPaidInput = {
  finance_company: string;
  actual_date: string;
  actual_amount: number;
  memo?: string | null;
};

/** create RPC 用。scheduled_* は実入金の写し（互換のため必須） */
export function buildFinanceReceiptPaidCreateBody(
  input: FinanceReceiptPaidInput
): {
  finance_company: string;
  scheduled_date: string | null;
  scheduled_amount: number;
  memo: string | null;
} {
  return {
    finance_company: input.finance_company,
    scheduled_date: input.actual_date || null,
    scheduled_amount: input.actual_amount,
    memo: input.memo ?? null,
  };
}

/** confirm RPC 用。登録直後に続けて呼び、status=入金済にする */
export function buildFinanceReceiptPaidConfirmBody(
  input: Pick<FinanceReceiptPaidInput, "actual_date" | "actual_amount" | "memo">
): {
  actual_date: string;
  actual_amount: number;
  memo: string | null;
} {
  return {
    actual_date: input.actual_date,
    actual_amount: input.actual_amount,
    memo: input.memo ?? null,
  };
}

/** correct RPC 用（新行は予定で作られるため、続けて confirm が必要） */
export function buildFinanceReceiptPaidCorrectBody(
  input: FinanceReceiptPaidInput
): {
  finance_company: string;
  scheduled_date: string | null;
  scheduled_amount: number;
  memo: string | null;
} {
  return buildFinanceReceiptPaidCreateBody(input);
}
