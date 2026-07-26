import type {
  WorkflowContext,
  WorkflowInvoiceInput,
  WorkflowOrderInput,
  WorkflowPaymentInput,
} from "@/lib/workflow/types";

type SettlementLike = {
  settlement_type?: string | null;
  settlementType?: string | null;
  loan_status?: string | null;
  loanStatus?: string | null;
  card_status?: string | null;
  cardStatus?: string | null;
  deposit_amount?: number | null;
  depositAmount?: number | null;
} | null;

type OrderLike = {
  id: string;
  status?: string | null;
  delivered_date?: string | null;
  deliveredDate?: string | null;
};

type InvoiceLike = {
  id: string;
  status?: string | null;
  invoice_amount?: number | null;
  invoiceAmount?: number | null;
};

type PaymentLike = {
  id: string;
  invoice_id?: string | null;
  invoiceId?: string | null;
  status?: string | null;
  payment_amount?: number | null;
  paymentAmount?: number | null;
};

/** DB / View 双方から WorkflowContext を組み立てる */
export function buildWorkflowContext(input: {
  settlement: SettlementLike;
  constructionCompletedDate?: string | null;
  orders: readonly OrderLike[];
  invoices?: readonly InvoiceLike[];
  payments?: readonly PaymentLike[];
}): WorkflowContext {
  const s = input.settlement;
  const orders: WorkflowOrderInput[] = input.orders.map((o) => ({
    id: o.id,
    status: o.status ?? null,
    deliveredDate: o.delivered_date ?? o.deliveredDate ?? null,
  }));
  const invoices: WorkflowInvoiceInput[] = (input.invoices || []).map((i) => ({
    id: i.id,
    status: i.status ?? null,
    invoiceAmount: Number(i.invoice_amount ?? i.invoiceAmount ?? 0) || 0,
  }));
  const payments: WorkflowPaymentInput[] = (input.payments || []).map((p) => ({
    id: p.id,
    invoiceId: p.invoice_id ?? p.invoiceId ?? null,
    status: p.status ?? null,
    paymentAmount: Number(p.payment_amount ?? p.paymentAmount ?? 0) || 0,
  }));

  return {
    settlementType: s?.settlement_type ?? s?.settlementType ?? null,
    loanStatus: s?.loan_status ?? s?.loanStatus ?? null,
    cardStatus: s?.card_status ?? s?.cardStatus ?? null,
    depositAmount: s?.deposit_amount ?? s?.depositAmount ?? null,
    constructionCompletedDate: input.constructionCompletedDate ?? null,
    orders,
    invoices,
    payments,
  };
}
