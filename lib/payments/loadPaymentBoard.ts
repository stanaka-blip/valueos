import { getCaseSettlementByCaseId } from "@/lib/repositories/caseSettlements";
import { CONFIRMED_PAYMENT_STATUSES } from "@/lib/payments/constants";
import {
  isSameMonth,
  summarizeInvoicePayments,
} from "@/lib/payments/invoicePaymentStatus";
import type { InvoicePaymentStatus } from "@/lib/payments/constants";
import { resolveSettlementRule } from "@/lib/workflow";
import { supabase } from "@/lib/supabase";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";
import {
  computeThreePartyRecoveryAmounts,
  hasPaidFinanceReceiptStatus,
  sumDealerPaidAmount,
} from "@/lib/threeParty/threePartyRecovery";

export type PaymentBoardRow = {
  invoiceId: string;
  invoiceNo: string;
  invoiceStatus: string | null;
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
  /** 3社間のみ。通常ARの payments とは別系統 */
  isThreeParty?: boolean;
  financePaid?: boolean;
  financeAmount?: number | null;
  effectiveRecoveryAmount?: number | null;
  threePartyUnpaidBalance?: number | null;
  needsFinanceRegister?: boolean;
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
    paymentRows = (fallback.data || []) as typeof paymentRows;
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

  // 3社間: finance_receipts / dealer_settlements は service_role のみ（通常 payments とは別）
  const threePartyCaseIds = caseIds.filter((id) => {
    const t = (settlementTypeByCase.get(id) || "").trim();
    return (
      t === "3社間決済" ||
      t === "三社間決済" ||
      t === "3社間" ||
      t === "三社間" ||
      t === "ローン"
    );
  });

  const financeByCase = new Map<
    string,
    Array<{ status: string | null; actual_amount: number | null; scheduled_amount: number | null }>
  >();
  const dealerPaidByCase = new Map<string, number>();
  if (threePartyCaseIds.length > 0) {
    try {
      const admin = getServiceRoleSupabase();
      const { data: finances } = await admin
        .from("finance_receipts")
        .select("case_id, status, actual_amount, scheduled_amount")
        .in("case_id", threePartyCaseIds);
      for (const fr of finances || []) {
        const cid = String(fr.case_id || "");
        if (!cid) continue;
        const list = financeByCase.get(cid) || [];
        list.push({
          status: (fr.status as string) || null,
          actual_amount:
            fr.actual_amount == null ? null : toNumber(fr.actual_amount),
          scheduled_amount: toNumber(fr.scheduled_amount),
        });
        financeByCase.set(cid, list);
      }
      const { data: dealers } = await admin
        .from("dealer_settlements")
        .select("case_id, status, actual_payout_amount, payout_amount")
        .in("case_id", threePartyCaseIds);
      const byCase = new Map<
        string,
        Array<{
          status: string | null;
          actualPayoutAmount: number | null;
          payoutAmount: number | null;
        }>
      >();
      for (const ds of dealers || []) {
        const cid = String(ds.case_id || "");
        if (!cid) continue;
        const list = byCase.get(cid) || [];
        list.push({
          status: (ds.status as string) || null,
          actualPayoutAmount:
            ds.actual_payout_amount == null
              ? null
              : toNumber(ds.actual_payout_amount),
          payoutAmount: toNumber(ds.payout_amount),
        });
        byCase.set(cid, list);
      }
      for (const [cid, list] of byCase) {
        dealerPaidByCase.set(cid, sumDealerPaidAmount(list));
      }
    } catch (e) {
      if (!(e instanceof ServerAdminConfigError)) {
        console.warn("[loadPaymentBoard] three-party enrich failed", e);
      }
    }
  }

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

    const caseId = (inv.case_id as string) || caseData?.id || "";
    const settlementType = settlementTypeByCase.get(caseId) || "";
    const rule = resolveSettlementRule(settlementType);
    const isThreeParty =
      settlementType === "3社間決済" ||
      settlementType === "三社間決済" ||
      settlementType === "3社間" ||
      settlementType === "三社間" ||
      settlementType === "ローン";

    let row: PaymentBoardRow = {
      invoiceId,
      invoiceNo: (inv.invoice_no as string) || "",
      invoiceStatus: (inv.status as string) || null,
      invoiceAmount: summary.invoiceAmount,
      invoiceDate: (inv.invoice_date as string) || null,
      dueDate: (inv.due_date as string) || null,
      caseId,
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
    };

    if (isThreeParty) {
      const frs = financeByCase.get(caseId) || [];
      const financePaid = hasPaidFinanceReceiptStatus(frs);
      const paidFr = frs.find((f) => String(f.status || "").trim() === "入金済");
      const financeAmount = financePaid
        ? paidFr?.actual_amount != null
          ? Math.floor(paidFr.actual_amount)
          : Math.floor(paidFr?.scheduled_amount || 0)
        : null;
      const dealerPaid = dealerPaidByCase.get(caseId) || 0;
      const recovery = computeThreePartyRecoveryAmounts({
        invoiceTotalAmount: summary.invoiceAmount,
        financePaidAmount: financeAmount,
        dealerPaidAmount: dealerPaid,
      });
      row = {
        ...row,
        isThreeParty: true,
        financePaid,
        financeAmount,
        effectiveRecoveryAmount: recovery.effectiveRecoveryAmount,
        threePartyUnpaidBalance: recovery.unpaidBalance,
        needsFinanceRegister: !financePaid,
        // 表示用: 顧客 payments と混同しないよう 3社間指標を優先
        confirmedPaidAmount: recovery.effectiveRecoveryAmount,
        unpaidAmount: recovery.unpaidBalance,
        nextAction: financePaid
          ? recovery.unpaidBalance > 0
            ? "仕切・支払を確認（支払管理）"
            : "信販入金済"
          : "信販入金を登録",
        displayStatus: financePaid
          ? recovery.unpaidBalance <= 0
            ? "入金済"
            : "一部入金"
          : "未入金",
      };
    }

    rows.push(row);

    unpaidTotal += row.unpaidAmount;
    if (!isThreeParty && summary.isOverdue) {
      overdueTotal += summary.unpaidAmount;
    }
    if (
      row.unpaidAmount > 0 &&
      isSameMonth((inv.due_date as string) || null, todayStr)
    ) {
      dueThisMonthTotal += row.unpaidAmount;
    }

    if (!isThreeParty) {
      for (const p of invPayments) {
        const status = ((p.status as string) || "").trim();
        if (
          CONFIRMED_PAYMENT_STATUSES.has(status) &&
          isSameMonth(p.payment_date as string, todayStr)
        ) {
          paidThisMonthTotal += toNumber(p.payment_amount);
        }
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
