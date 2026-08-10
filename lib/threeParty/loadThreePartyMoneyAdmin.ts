import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";
import {
  resolveDealerSettlementDisplayStatus,
  resolveFinanceReceiptDisplayStatus,
  resolveSupplierPaymentDisplayStatus,
} from "@/lib/threeParty/moneyEventStatus";

export type FinanceReceiptView = {
  id: string;
  financeCompany: string;
  scheduledDate: string | null;
  scheduledAmount: number;
  actualDate: string | null;
  actualAmount: number | null;
  status: string;
  displayStatus: string;
  memo: string;
  correctsId: string | null;
};

export type DealerSettlementLineView = {
  id: string;
  sortOrder: number;
  lineKind: string;
  description: string;
  amount: number;
  memo: string;
};

export type DealerSettlementView = {
  id: string;
  statementNo: string;
  issueDate: string | null;
  financeReceiptId: string | null;
  invoiceId: string | null;
  creditReceivedAmount: number;
  veShareAmount: number;
  adjustmentTotalAmount: number;
  payoutAmount: number;
  scheduledPayoutDate: string | null;
  actualPayoutDate: string | null;
  actualPayoutAmount: number | null;
  contractDate: string | null;
  deliveryDate: string | null;
  status: string;
  displayStatus: string;
  memo: string;
  correctsId: string | null;
  lines: DealerSettlementLineView[];
};

export type SupplierPaymentView = {
  id: string;
  supplierId: string;
  supplierName: string;
  orderId: string | null;
  orderNo: string;
  dueDate: string | null;
  scheduledAmount: number;
  paidDate: string | null;
  paidAmount: number | null;
  status: string;
  displayStatus: string;
  memo: string;
  correctsId: string | null;
};

export type ThreePartyMoneyView = {
  financeReceipts: FinanceReceiptView[];
  dealerSettlements: DealerSettlementView[];
  supplierPayments: SupplierPaymentView[];
  loadError?: string;
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function loadThreePartyMoneyByCaseIdAdmin(
  caseId: string,
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<ThreePartyMoneyView> {
  try {
    return await loadWithClient(caseId, client);
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        financeReceipts: [],
        dealerSettlements: [],
        supplierPayments: [],
        loadError: "サーバー設定が完了していません",
      };
    }
    return {
      financeReceipts: [],
      dealerSettlements: [],
      supplierPayments: [],
      loadError: "3社間の入出金情報を取得できませんでした",
    };
  }
}

async function loadWithClient(
  caseId: string,
  client: SupabaseClient<Database>
): Promise<ThreePartyMoneyView> {
  const today = new Date().toISOString().slice(0, 10);

  const [frRes, dsRes, spRes] = await Promise.all([
    client
      .from("finance_receipts")
      .select(
        "id, finance_company, scheduled_date, scheduled_amount, actual_date, actual_amount, status, memo, corrects_id"
      )
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    client
      .from("dealer_settlements")
      .select(
        "id, statement_no, issue_date, finance_receipt_id, invoice_id, credit_received_amount, ve_share_amount, adjustment_total_amount, payout_amount, scheduled_payout_date, actual_payout_date, actual_payout_amount, contract_date, delivery_date, status, memo, corrects_id"
      )
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    client
      .from("supplier_payments")
      .select(
        "id, supplier_id, order_id, due_date, scheduled_amount, paid_date, paid_amount, status, memo, corrects_id"
      )
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
  ]);

  if (frRes.error || dsRes.error || spRes.error) {
    console.warn("[threeParty load]", frRes.error?.message, dsRes.error?.message, spRes.error?.message);
    return {
      financeReceipts: [],
      dealerSettlements: [],
      supplierPayments: [],
      loadError:
        "3社間の入出金テーブルが未適用か、取得に失敗しました（Migration 適用を確認してください）",
    };
  }

  const settlementIds = (dsRes.data || []).map((r) => r.id as string);
  const linesBySettlement = new Map<string, DealerSettlementLineView[]>();
  if (settlementIds.length > 0) {
    const { data: lines, error: lineErr } = await client
      .from("dealer_settlement_lines")
      .select("id, dealer_settlement_id, sort_order, line_kind, description, amount, memo")
      .in("dealer_settlement_id", settlementIds)
      .order("sort_order", { ascending: true });
    if (!lineErr) {
      for (const line of lines || []) {
        const sid = String(line.dealer_settlement_id);
        const list = linesBySettlement.get(sid) || [];
        list.push({
          id: line.id as string,
          sortOrder: Number(line.sort_order) || 0,
          lineKind: String(line.line_kind || ""),
          description: String(line.description || ""),
          amount: toNumber(line.amount as number | string | null),
          memo: String(line.memo || ""),
        });
        linesBySettlement.set(sid, list);
      }
    }
  }

  const supplierIds = Array.from(
    new Set((spRes.data || []).map((r) => String(r.supplier_id || "")).filter(Boolean))
  );
  const orderIds = Array.from(
    new Set((spRes.data || []).map((r) => String(r.order_id || "")).filter(Boolean))
  );

  const supplierNameById = new Map<string, string>();
  if (supplierIds.length > 0) {
    // dealers/suppliers は database.types 未収載のため untyped で読む
    const { data: suppliers } = await (client as SupabaseClient)
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    for (const s of suppliers || []) {
      supplierNameById.set(String(s.id), String(s.name || ""));
    }
  }

  const orderNoById = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await client
      .from("orders")
      .select("id, order_no")
      .in("id", orderIds);
    for (const o of orders || []) {
      orderNoById.set(String(o.id), String(o.order_no || ""));
    }
  }

  const financeReceipts: FinanceReceiptView[] = (frRes.data || []).map((row) => {
    const status = String(row.status || "");
    return {
      id: row.id as string,
      financeCompany: String(row.finance_company || ""),
      scheduledDate: (row.scheduled_date as string) || null,
      scheduledAmount: toNumber(row.scheduled_amount as number | string | null),
      actualDate: (row.actual_date as string) || null,
      actualAmount:
        row.actual_amount == null
          ? null
          : toNumber(row.actual_amount as number | string | null),
      status,
      displayStatus: resolveFinanceReceiptDisplayStatus({
        status,
        scheduledDate: (row.scheduled_date as string) || null,
        today,
      }),
      memo: String(row.memo || ""),
      correctsId: (row.corrects_id as string) || null,
    };
  });

  const dealerSettlements: DealerSettlementView[] = (dsRes.data || []).map((row) => {
    const status = String(row.status || "");
    return {
      id: row.id as string,
      statementNo: String(row.statement_no || ""),
      issueDate: (row.issue_date as string) || null,
      financeReceiptId: (row.finance_receipt_id as string) || null,
      invoiceId: (row.invoice_id as string) || null,
      creditReceivedAmount: toNumber(row.credit_received_amount as number | string | null),
      veShareAmount: toNumber(row.ve_share_amount as number | string | null),
      adjustmentTotalAmount: toNumber(row.adjustment_total_amount as number | string | null),
      payoutAmount: toNumber(row.payout_amount as number | string | null),
      scheduledPayoutDate: (row.scheduled_payout_date as string) || null,
      actualPayoutDate: (row.actual_payout_date as string) || null,
      actualPayoutAmount:
        row.actual_payout_amount == null
          ? null
          : toNumber(row.actual_payout_amount as number | string | null),
      contractDate: (row.contract_date as string) || null,
      deliveryDate: (row.delivery_date as string) || null,
      status,
      displayStatus: resolveDealerSettlementDisplayStatus({
        status,
        scheduledPayoutDate: (row.scheduled_payout_date as string) || null,
        today,
      }),
      memo: String(row.memo || ""),
      correctsId: (row.corrects_id as string) || null,
      lines: linesBySettlement.get(row.id as string) || [],
    };
  });

  const supplierPayments: SupplierPaymentView[] = (spRes.data || []).map((row) => {
    const status = String(row.status || "");
    const supplierId = String(row.supplier_id || "");
    const orderId = (row.order_id as string) || null;
    return {
      id: row.id as string,
      supplierId,
      supplierName: supplierNameById.get(supplierId) || "",
      orderId,
      orderNo: orderId ? orderNoById.get(orderId) || "" : "",
      dueDate: (row.due_date as string) || null,
      scheduledAmount: toNumber(row.scheduled_amount as number | string | null),
      paidDate: (row.paid_date as string) || null,
      paidAmount:
        row.paid_amount == null
          ? null
          : toNumber(row.paid_amount as number | string | null),
      status,
      displayStatus: resolveSupplierPaymentDisplayStatus({
        status,
        dueDate: (row.due_date as string) || null,
        today,
      }),
      memo: String(row.memo || ""),
      correctsId: (row.corrects_id as string) || null,
    };
  });

  return { financeReceipts, dealerSettlements, supplierPayments };
}
