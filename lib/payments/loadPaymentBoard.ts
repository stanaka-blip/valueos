import { getCaseSettlementByCaseId } from "@/lib/repositories/caseSettlements";
import {
  isSameMonth,
  summarizeInvoicePayments,
} from "@/lib/payments/invoicePaymentStatus";
import type { InvoicePaymentStatus } from "@/lib/payments/constants";
import { resolveSettlementRule } from "@/lib/workflow";
import { supabase } from "@/lib/supabase";

export type PaymentBoardRow = {
  invoiceId: string;
  invoiceNo: string;
  invoiceAmount: number;
  invoiceDate: string | null;
  dueDate: string | null;
  caseId: string;
  caseNo: string;
  customerName: string;
  dealerName: string;
  settlementType: string;
  settlementTypeLabel: string;
  confirmedPaidAmount: number;
  unpaidAmount: number;
  overpaidAmount: number;
  displayStatus: InvoicePaymentStatus;
  delayDays: number;
  nextAction: string;
  warnings: string[];
};

export type PaymentBoardSummary = {
  unpaidTotal: number;
  dueThisMonthTotal: number;
  overdueTotal: number;
  paidThisMonthTotal: number;
};

export type PaymentBoardData = {
  rows: PaymentBoardRow[];
  summary: PaymentBoardSummary;
  error: string | null;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

export async function loadPaymentBoard(today?: string): Promise<PaymentBoardData> {
  const todayStr =
    today ||
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      id,
      case_id,
      invoice_no,
      invoice_date,
      due_date,
      invoice_amount,
      status,
      cases (
        id,
        case_no,
        customer_name,
        dealers (
          name
        )
      )
    `
    )
    .order("invoice_date", { ascending: false, nullsFirst: false });

  if (invoiceError) {
    return {
      rows: [],
      summary: {
        unpaidTotal: 0,
        dueThisMonthTotal: 0,
        overdueTotal: 0,
        paidThisMonthTotal: 0,
      },
      error: invoiceError.message,
    };
  }

  const invoiceIds = (invoices || []).map((i) => i.id as string);
  const { data: payments, error: paymentError } = invoiceIds.length
    ? await supabase
        .from("payments")
        .select(
          "id, invoice_id, payment_date, payment_amount, status, memo, payment_method, payer_name, bank_account"
        )
        .in("invoice_id", invoiceIds)
    : { data: [], error: null };

  // 新カラム未適用でも動くようフォールバック
  let paymentRows = payments || [];
  if (paymentError && /payment_method|payer_name|bank_account|schema cache/i.test(paymentError.message)) {
    const fallback = await supabase
      .from("payments")
      .select("id, invoice_id, payment_date, payment_amount, status, memo")
      .in("invoice_id", invoiceIds);
    paymentRows = fallback.data || [];
  } else if (paymentError) {
    return {
      rows: [],
      summary: {
        unpaidTotal: 0,
        dueThisMonthTotal: 0,
        overdueTotal: 0,
        paidThisMonthTotal: 0,
      },
      error: paymentError.message,
    };
  }

  const paymentsByInvoice = new Map<string, typeof paymentRows>();
  for (const p of paymentRows) {
    const key = (p.invoice_id as string) || "";
    if (!key) continue;
    const list = paymentsByInvoice.get(key) || [];
    list.push(p);
    paymentsByInvoice.set(key, list);
  }

  const caseIds = [
    ...new Set(
      (invoices || [])
        .map((i) => i.case_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const settlementTypeByCase = new Map<string, string>();
  await Promise.all(
    caseIds.map(async (caseId) => {
      const result = await getCaseSettlementByCaseId(caseId);
      if (result.data?.settlement_type) {
        settlementTypeByCase.set(caseId, result.data.settlement_type);
      }
    })
  );

  const rows: PaymentBoardRow[] = [];
  let unpaidTotal = 0;
  let dueThisMonthTotal = 0;
  let overdueTotal = 0;
  let paidThisMonthTotal = 0;

  for (const inv of invoices || []) {
    const caseData = getSingle(
      inv.cases as
        | {
            id: string;
            case_no: string | null;
            customer_name: string | null;
            dealers:
              | { name: string | null }
              | { name: string | null }[]
              | null;
          }
        | {
            id: string;
            case_no: string | null;
            customer_name: string | null;
            dealers:
              | { name: string | null }
              | { name: string | null }[]
              | null;
          }[]
        | null
    );
    const dealer = getSingle(caseData?.dealers);
    const invoiceId = inv.id as string;
    const invPayments = paymentsByInvoice.get(invoiceId) || [];
    const summary = summarizeInvoicePayments({
      invoiceAmount: inv.invoice_amount as number,
      dueDate: (inv.due_date as string) || null,
      payments: invPayments.map((p) => ({
        paymentAmount: toNumber(p.payment_amount),
        status: (p.status as string) || null,
      })),
      today: todayStr,
    });

    const settlementType =
      settlementTypeByCase.get((inv.case_id as string) || "") || "";
    const rule = resolveSettlementRule(settlementType);

    rows.push({
      invoiceId,
      invoiceNo: (inv.invoice_no as string) || "",
      invoiceAmount: summary.invoiceAmount,
      invoiceDate: (inv.invoice_date as string) || null,
      dueDate: (inv.due_date as string) || null,
      caseId: (inv.case_id as string) || caseData?.id || "",
      caseNo: caseData?.case_no || "",
      customerName: caseData?.customer_name || "",
      dealerName: dealer?.name || "",
      settlementType,
      settlementTypeLabel: rule?.label || settlementType || "未設定",
      confirmedPaidAmount: summary.confirmedPaidAmount,
      unpaidAmount: summary.unpaidAmount,
      overpaidAmount: summary.overpaidAmount,
      displayStatus: summary.displayStatus,
      delayDays: summary.delayDays,
      nextAction: summary.nextAction,
      warnings: summary.warnings,
    });

    unpaidTotal += summary.unpaidAmount;
    if (summary.isOverdue) {
      overdueTotal += summary.unpaidAmount;
    }
    if (
      summary.unpaidAmount > 0 &&
      isSameMonth((inv.due_date as string) || null, todayStr)
    ) {
      dueThisMonthTotal += summary.unpaidAmount;
    }

    for (const p of invPayments) {
      if ((p.status as string) === "入金確認済" && isSameMonth(p.payment_date as string, todayStr)) {
        paidThisMonthTotal += toNumber(p.payment_amount);
      }
    }
  }

  return {
    rows,
    summary: {
      unpaidTotal,
      dueThisMonthTotal,
      overdueTotal,
      paidThisMonthTotal,
    },
    error: null,
  };
}
