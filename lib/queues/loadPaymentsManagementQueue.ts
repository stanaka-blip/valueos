import "server-only";

import {
  buildSupplierPaymentQueueRow,
  buildThreePartyPaymentQueueRow,
  sortSupplierPaymentQueueRows,
  sortThreePartyPaymentQueueRows,
  type SupplierPaymentQueueRow,
  type ThreePartyPaymentQueueRow,
} from "@/lib/queues/paymentsManagementQueue";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

export type PaymentsManagementLoadResult = {
  threePartyRows: ThreePartyPaymentQueueRow[];
  supplierRows: SupplierPaymentQueueRow[];
  error: string | null;
};

function getSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

type CaseRow = {
  id: string;
  case_no: string | null;
  status: string | null;
  customer_name: string | null;
  dealer_id: string | null;
  dealers: { name: string | null } | { name: string | null }[] | null;
};

type SettlementTypeRow = {
  case_id: string;
  settlement_type: string | null;
  loan_status: string | null;
  approval_number: string | null;
};

type FinanceReceiptRow = {
  id: string;
  case_id: string;
  finance_company: string | null;
  status: string | null;
  actual_date: string | null;
  actual_amount: number | null;
  scheduled_amount: number | null;
};

type DealerSettlementRow = {
  id: string;
  case_id: string;
  status: string | null;
  credit_received_amount: number | null;
  ve_share_amount: number | null;
  adjustment_total_amount: number | null;
  payout_amount: number | null;
  scheduled_payout_date: string | null;
  finance_receipt_id: string | null;
};

type OrderRow = {
  id: string;
  case_id: string | null;
  supplier_id: string | null;
  order_no: string | null;
  status: string | null;
  delivered_date: string | null;
  order_amount: number | null;
};

type SupplierPaymentRow = {
  id: string;
  case_id: string | null;
  order_id: string | null;
  supplier_id: string | null;
  status: string | null;
  due_date: string | null;
  scheduled_amount: number | null;
};

type InvoiceRow = {
  id: string;
  case_id: string | null;
  status: string | null;
  invoice_amount: number | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

export async function loadPaymentsManagementQueue(): Promise<PaymentsManagementLoadResult> {
  try {
    const supabase = getServiceRoleSupabase();

    const [
      casesRes,
      settlementsRes,
      financeRes,
      dealerRes,
      ordersRes,
      invoicesRes,
      supplierPayRes,
      suppliersRes,
    ] = await Promise.all([
      supabase.from("cases").select(
        `
        id,
        case_no,
        status,
        customer_name,
        dealer_id,
        dealers ( name )
      `
      ),
      supabase
        .from("case_settlements")
        .select("case_id, settlement_type, loan_status, approval_number"),
      supabase
        .from("finance_receipts")
        .select(
          "id, case_id, finance_company, status, actual_date, actual_amount, scheduled_amount"
        ),
      supabase
        .from("dealer_settlements")
        .select(
          "id, case_id, status, credit_received_amount, ve_share_amount, adjustment_total_amount, payout_amount, scheduled_payout_date, finance_receipt_id"
        ),
      supabase
        .from("orders")
        .select(
          "id, case_id, supplier_id, order_no, status, delivered_date, order_amount"
        ),
      supabase
        .from("invoices")
        .select("id, case_id, status, invoice_amount"),
      supabase
        .from("supplier_payments")
        .select(
          "id, case_id, order_id, supplier_id, status, due_date, scheduled_amount"
        ),
      supabase.from("suppliers").select("id, name"),
    ]);

    const error =
      casesRes.error?.message ||
      settlementsRes.error?.message ||
      financeRes.error?.message ||
      dealerRes.error?.message ||
      ordersRes.error?.message ||
      invoicesRes.error?.message ||
      supplierPayRes.error?.message ||
      suppliersRes.error?.message ||
      null;
    if (error) {
      return { threePartyRows: [], supplierRows: [], error };
    }

    const cases = (casesRes.data || []) as unknown as CaseRow[];
    const settlements = (settlementsRes.data ||
      []) as unknown as SettlementTypeRow[];
    const financeRows = (financeRes.data ||
      []) as unknown as FinanceReceiptRow[];
    const dealerRows = (dealerRes.data ||
      []) as unknown as DealerSettlementRow[];
    const orders = (ordersRes.data || []) as unknown as OrderRow[];
    const invoices = (invoicesRes.data || []) as unknown as InvoiceRow[];
    const supplierPays = (supplierPayRes.data ||
      []) as unknown as SupplierPaymentRow[];
    const suppliers = (suppliersRes.data || []) as unknown as SupplierRow[];

    const settlementByCase = new Map<
      string,
      { settlementType: string; loanStatus: string | null; approvalNumber: string | null }
    >();
    for (const row of settlements) {
      settlementByCase.set(String(row.case_id), {
        settlementType: String(row.settlement_type || ""),
        loanStatus: row.loan_status,
        approvalNumber: row.approval_number,
      });
    }

    const financeByCase = new Map<
      string,
      Array<{
        id: string;
        financeCompany: string;
        status: string;
        actualDate: string | null;
        actualAmount: number | null;
        scheduledAmount: number;
      }>
    >();
    for (const row of financeRows) {
      const caseId = String(row.case_id);
      const list = financeByCase.get(caseId) || [];
      list.push({
        id: String(row.id),
        financeCompany: String(row.finance_company || ""),
        status: String(row.status || ""),
        actualDate: row.actual_date || null,
        actualAmount: row.actual_amount == null ? null : Number(row.actual_amount),
        scheduledAmount: Number(row.scheduled_amount) || 0,
      });
      financeByCase.set(caseId, list);
    }

    const dealerByCase = new Map<
      string,
      Array<{
        id: string;
        status: string;
        creditReceivedAmount: number;
        veShareAmount: number;
        adjustmentTotalAmount: number;
        payoutAmount: number;
        scheduledPayoutDate: string | null;
        financeReceiptId: string | null;
      }>
    >();
    for (const row of dealerRows) {
      const caseId = String(row.case_id);
      const list = dealerByCase.get(caseId) || [];
      list.push({
        id: String(row.id),
        status: String(row.status || ""),
        creditReceivedAmount: Number(row.credit_received_amount) || 0,
        veShareAmount: Number(row.ve_share_amount) || 0,
        adjustmentTotalAmount: Number(row.adjustment_total_amount) || 0,
        payoutAmount: Number(row.payout_amount) || 0,
        scheduledPayoutDate: row.scheduled_payout_date || null,
        financeReceiptId: row.finance_receipt_id || null,
      });
      dealerByCase.set(caseId, list);
    }

    const invoicesByCase = new Map<
      string,
      Array<{ id: string; status: string | null; invoiceAmount: number }>
    >();
    for (const row of invoices) {
      const caseId = row.case_id ? String(row.case_id) : "";
      if (!caseId) continue;
      const list = invoicesByCase.get(caseId) || [];
      list.push({
        id: String(row.id),
        status: row.status,
        invoiceAmount: Number(row.invoice_amount) || 0,
      });
      invoicesByCase.set(caseId, list);
    }

    const ordersByCase = new Map<
      string,
      Array<{ id: string; status: string | null; deliveredDate: string | null }>
    >();
    for (const o of orders) {
      const caseId = o.case_id ? String(o.case_id) : "";
      if (!caseId) continue;
      const list = ordersByCase.get(caseId) || [];
      list.push({
        id: String(o.id),
        status: o.status,
        deliveredDate: o.delivered_date,
      });
      ordersByCase.set(caseId, list);
    }

    const threePartyRows: ThreePartyPaymentQueueRow[] = [];
    for (const c of cases) {
      const dealer = getSingle(c.dealers);
      const settlement = settlementByCase.get(String(c.id));
      const row = buildThreePartyPaymentQueueRow({
        caseId: String(c.id),
        caseNo: c.case_no,
        caseStatus: c.status,
        customerName: c.customer_name,
        dealerId: c.dealer_id,
        dealerName: dealer?.name || null,
        settlementType: settlement?.settlementType || null,
        loanStatus: settlement?.loanStatus || null,
        approvalNumber: settlement?.approvalNumber || null,
        financeReceipts: financeByCase.get(String(c.id)) || [],
        dealerSettlements: dealerByCase.get(String(c.id)) || [],
        invoices: invoicesByCase.get(String(c.id)) || [],
        orders: ordersByCase.get(String(c.id)) || [],
      });
      if (row) threePartyRows.push(row);
    }

    const supplierNameById = new Map<string, string>();
    for (const s of suppliers) {
      supplierNameById.set(String(s.id), String(s.name || ""));
    }

    const caseMeta = new Map<
      string,
      {
        caseNo: string | null;
        caseStatus: string | null;
        customerName: string | null;
      }
    >();
    for (const c of cases) {
      caseMeta.set(String(c.id), {
        caseNo: c.case_no,
        caseStatus: c.status,
        customerName: c.customer_name,
      });
    }

    const paymentsByOrder = new Map<
      string,
      Array<{
        id: string;
        status: string;
        dueDate: string | null;
        scheduledAmount: number;
      }>
    >();
    for (const p of supplierPays) {
      const orderId = p.order_id ? String(p.order_id) : "";
      if (!orderId) continue;
      const list = paymentsByOrder.get(orderId) || [];
      list.push({
        id: String(p.id),
        status: String(p.status || ""),
        dueDate: p.due_date || null,
        scheduledAmount: Number(p.scheduled_amount) || 0,
      });
      paymentsByOrder.set(orderId, list);
    }

    const supplierRows: SupplierPaymentQueueRow[] = [];
    for (const o of orders) {
      const caseId = o.case_id ? String(o.case_id) : "";
      if (!caseId) continue;
      const meta = caseMeta.get(caseId);
      if (!meta) continue;
      const supplierId = o.supplier_id ? String(o.supplier_id) : null;
      const row = buildSupplierPaymentQueueRow({
        orderId: String(o.id),
        orderNo: o.order_no,
        caseId,
        caseNo: meta.caseNo,
        caseStatus: meta.caseStatus,
        customerName: meta.customerName,
        supplierId,
        supplierName: supplierId
          ? supplierNameById.get(supplierId) || null
          : null,
        orderStatus: o.status,
        deliveredDate: o.delivered_date,
        orderAmount: Number(o.order_amount) || 0,
        payments: paymentsByOrder.get(String(o.id)) || [],
      });
      if (row) supplierRows.push(row);
    }

    return {
      threePartyRows: sortThreePartyPaymentQueueRows(threePartyRows),
      supplierRows: sortSupplierPaymentQueueRows(supplierRows),
      error: null,
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return {
        threePartyRows: [],
        supplierRows: [],
        error: "サーバー設定が完了していません",
      };
    }
    return {
      threePartyRows: [],
      supplierRows: [],
      error: e instanceof Error ? e.message : "支払キューの取得に失敗しました",
    };
  }
}
