/** ローン・カードは将来値を増やせるステータス方式 */

export const LOAN_STATUSES = [
  "未申請",
  "申請中",
  "承認済",
  "否認",
] as const;

export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const LOAN_APPROVED_STATUSES = ["承認済"] as const;

export const CARD_STATUSES = [
  "未決済",
  "処理中",
  "決済成功",
  "決済失敗",
  "取消",
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_SUCCESS_STATUSES = ["決済成功"] as const;
