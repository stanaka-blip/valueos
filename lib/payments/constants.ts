export const PAYMENT_METHODS = [
  "銀行振込",
  "カード",
  "ローン会社",
  "現金",
  "相殺",
  "その他",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** UI select 用エイリアス */
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS;

/**
 * 画面で使う入金ステータス
 *
 * 注: DB カラム default は現状 '未入金'。
 * 将来的に default を '確認待ち' へ整理予定（アプリ新規登録では本一覧のみ使用）。
 */
export const PAYMENT_RECORD_STATUSES = [
  "確認待ち",
  "入金確認済",
  "取消",
] as const;

export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];

/** UI select 用エイリアス */
export const PAYMENT_STATUS_OPTIONS = PAYMENT_RECORD_STATUSES;

/** 請求単位の入金状況（自動判定） */
export const INVOICE_PAYMENT_STATUSES = [
  "未入金",
  "一部入金",
  "入金済",
  "期限超過",
] as const;

export type InvoicePaymentStatus = (typeof INVOICE_PAYMENT_STATUSES)[number];

/** 集計対象になる確認済ステータス */
export const CONFIRMED_PAYMENT_STATUSES = new Set(["入金確認済"]);

/** 確認待ち扱い（集計対象外） */
export const PENDING_PAYMENT_STATUSES = new Set(["確認待ち", "入金確認中"]);

/** 取消（集計対象外） */
export const CANCELLED_PAYMENT_STATUSES = new Set(["取消"]);
