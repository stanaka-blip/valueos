/**
 * ダッシュボード未入金・期限超過。
 * 通常決済: invoice − 顧客 payments（既存 summarizeInvoicePayments）。
 * 3社間: /payments と同じ computeThreePartyRecoveryAmounts。
 * 3社間は顧客請求 due では期限超過にしない。
 */

import { summarizeInvoicePayments } from "@/lib/payments/invoicePaymentStatus";
import {
  computeThreePartyRecoveryAmounts,
  hasPaidFinanceReceiptStatus,
  sumDealerPaidAmount,
} from "@/lib/threeParty/threePartyRecovery";
import { resolveSettlementRule } from "@/lib/workflow/normalize";

export type DashboardPaymentInput = {
  invoice_id?: string | null;
  payment_amount?: number | string | null;
  status?: string | null;
};

export type DashboardFinanceReceiptInput = {
  case_id?: string | null;
  status?: string | null;
  actual_amount?: number | string | null;
  scheduled_amount?: number | string | null;
};

export type DashboardDealerSettlementInput = {
  case_id?: string | null;
  status?: string | null;
  actual_payout_amount?: number | string | null;
  payout_amount?: number | string | null;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isThreePartySettlementType(
  settlementType: string | null | undefined
): boolean {
  return resolveSettlementRule(settlementType)?.key === "3社間決済";
}

/** /payments の 3社間信販入金額と同じ（入金済の actual 優先、なければ scheduled） */
export function financePaidAmountForUnpaid(
  receipts: ReadonlyArray<{
    status?: string | null;
    actual_amount?: number | string | null;
    scheduled_amount?: number | string | null;
  }>
): number | null {
  if (
    !hasPaidFinanceReceiptStatus(
      receipts.map((r) => ({ status: r.status ?? null }))
    )
  ) {
    return null;
  }
  const paid = receipts.find((f) => String(f.status || "").trim() === "入金済");
  if (!paid) return null;
  if (paid.actual_amount != null && Number.isFinite(Number(paid.actual_amount))) {
    return Math.floor(Number(paid.actual_amount));
  }
  return Math.floor(toNumber(paid.scheduled_amount));
}

export type DashboardInvoiceUnpaidResult = {
  unpaidAmount: number;
  isUnpaidLike: boolean;
  isOverdue: boolean;
};

export function summarizeDashboardInvoiceUnpaid(input: {
  invoiceAmount: number | string | null | undefined;
  dueDate: string | null | undefined;
  payments: DashboardPaymentInput[];
  settlementType: string | null | undefined;
  financeReceipts: DashboardFinanceReceiptInput[];
  dealerSettlements: DashboardDealerSettlementInput[];
  today?: string;
}): DashboardInvoiceUnpaidResult {
  const customer = summarizeInvoicePayments({
    invoiceAmount: input.invoiceAmount,
    dueDate: input.dueDate,
    payments: input.payments.map((p) => ({
      paymentAmount: toNumber(p.payment_amount),
      status: p.status,
    })),
    today: input.today,
  });

  if (!isThreePartySettlementType(input.settlementType)) {
    return {
      unpaidAmount: customer.unpaidAmount,
      isUnpaidLike:
        customer.paymentStatus === "未入金" ||
        customer.paymentStatus === "一部入金",
      isOverdue: customer.isOverdue,
    };
  }

  const financePaidAmount = financePaidAmountForUnpaid(input.financeReceipts);
  const dealerPaid = sumDealerPaidAmount(
    input.dealerSettlements.map((d) => ({
      status: d.status,
      actualPayoutAmount:
        d.actual_payout_amount == null ? null : toNumber(d.actual_payout_amount),
      payoutAmount: toNumber(d.payout_amount),
    }))
  );
  const recovery = computeThreePartyRecoveryAmounts({
    invoiceTotalAmount: customer.invoiceAmount,
    financePaidAmount,
    dealerPaidAmount: dealerPaid,
  });

  return {
    unpaidAmount: recovery.unpaidBalance,
    isUnpaidLike: recovery.unpaidBalance > 0,
    isOverdue: false,
  };
}
