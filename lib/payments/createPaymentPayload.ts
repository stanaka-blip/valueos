/**
 * 新規入金登録ペイロード組み立て（画面入力の case_id は信用しない）
 *
 * ルール:
 * 1. invoice_id 必須
 * 2. payment_amount 必須かつ 0 円超
 * 3. case_id は invoices.case_id から決定
 * 4. case_id と invoice_id が異なる案件を指す組み合わせは拒否
 *
 * 注: DB default の status='未入金' は将来 '確認待ち' へ整理予定。
 *     アプリ新規登録では PAYMENT_RECORD_STATUSES のみを使う。
 */

import type { PaymentMethod, PaymentRecordStatus } from "@/lib/payments/constants";

export type InvoiceForPayment = {
  id: string;
  case_id: string | null;
};

export type CreatePaymentInput = {
  invoice: InvoiceForPayment | null | undefined;
  /** 画面や URL から渡された請求ID（invoice.id と一致必須） */
  invoiceId: string | null | undefined;
  paymentDate: string | null | undefined;
  paymentAmount: number | string | null | undefined;
  paymentMethod: PaymentMethod | string | null | undefined;
  payerName?: string | null;
  bankAccount?: string | null;
  status: PaymentRecordStatus | string | null | undefined;
  memo?: string | null;
};

export type PaymentInsertPayload = {
  invoice_id: string;
  case_id: string;
  payment_date: string;
  payment_amount: number;
  payment_method: string;
  payer_name: string | null;
  bank_account: string | null;
  status: string;
  memo: string | null;
};

export type CreatePaymentResult =
  | { ok: true; payload: PaymentInsertPayload }
  | { ok: false; error: string };

function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function buildPaymentInsertPayload(
  input: CreatePaymentInput
): CreatePaymentResult {
  const invoiceId = (input.invoiceId || "").trim();
  if (!invoiceId) {
    return { ok: false, error: "invoice_id は必須です。" };
  }

  const invoice = input.invoice;
  if (!invoice?.id) {
    return { ok: false, error: "請求情報を取得できていません。" };
  }

  if (invoice.id !== invoiceId) {
    return {
      ok: false,
      error: "請求IDが一致しません。請求詳細から開き直してください。",
    };
  }

  const caseId = (invoice.case_id || "").trim();
  if (!caseId) {
    return {
      ok: false,
      error: "請求に案件が紐づいていないため入金登録できません。",
    };
  }

  const paymentDate = (input.paymentDate || "").trim();
  if (!paymentDate) {
    return { ok: false, error: "入金日を入力してください。" };
  }

  const paymentAmount = toAmount(input.paymentAmount);
  if (paymentAmount === null) {
    return { ok: false, error: "入金金額は必須です。" };
  }
  if (paymentAmount <= 0) {
    return { ok: false, error: "入金金額は1円以上で入力してください。" };
  }

  const paymentMethod = (input.paymentMethod || "").trim();
  if (!paymentMethod) {
    return { ok: false, error: "入金方法を選択してください。" };
  }

  const status = (input.status || "").trim();
  if (!status) {
    return { ok: false, error: "ステータスを選択してください。" };
  }

  return {
    ok: true,
    payload: {
      invoice_id: invoiceId,
      // 画面入力値は使わず、請求レコードの case_id のみ採用
      case_id: caseId,
      payment_date: paymentDate,
      payment_amount: paymentAmount,
      payment_method: paymentMethod,
      payer_name: (input.payerName || "").trim() || null,
      bank_account: (input.bankAccount || "").trim() || null,
      status,
      memo: (input.memo || "").trim() || null,
    },
  };
}
