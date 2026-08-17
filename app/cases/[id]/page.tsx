import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { resolveProductIdentity } from "@/app/orders/productIdentity";
import {
  buildDeliveryQuantityLines,
  buildOrderDisplayLines,
} from "@/lib/orders/orderPackageDisplay";

import CaseDetailView, {
  type CaseDetailViewData,
  type CaseProductRow,
  type InvoiceRow,
  type OrderRow,
  type PaymentRow,
  type TaskRow,
} from "./CaseDetailView";
import { resolveCaseDetailTabId } from "./caseDetailTabs";
import { toCaseProductDisplayRow } from "./productDisplay";
import { toSettlementViewData } from "./settlementView";
import { getCaseSettlementByCaseIdAdmin } from "@/lib/caseSettlements/getCaseSettlementAdmin";
import { loadThreePartyMoneyByCaseIdAdmin } from "@/lib/threeParty/loadThreePartyMoneyAdmin";
import { buildWorkflowContext } from "@/lib/workflow/buildContext";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";

export const dynamic = "force-dynamic";

type Dealer = {
  name: string | null;
  contact_name: string | null;
  payment_type: string | null;
};

type ManufacturerRelation = {
  name: string | null;
};

type ProductRelation = {
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: ManufacturerRelation | ManufacturerRelation[] | null;
};

type SupplierRelation = {
  name: string | null;
};

type PackageRelation = {
  name: string | null;
};

function getSingleRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) {
    return null;
  }

  if (Array.isArray(relation)) {
    return relation[0] || null;
  }

  return relation;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") {
    return 0;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const [
    { data: caseData, error: caseError },
    { data: tasksData, error: tasksError },
    { data: caseProductsData, error: caseProductsError },
    { data: ordersData, error: ordersError },
    { data: invoicesData, error: invoicesError },
    { data: paymentsData, error: paymentsError },
    settlementResult,
    threePartyMoney,
  ] = await Promise.all([
    supabase
      .from("cases")
      .select(
        `
        *,
        dealers (
          name,
          contact_name,
          payment_type
        )
      `
      )
      .eq("id", id)
      .single(),

    supabase
      .from("tasks")
      .select(
        `
        id,
        title,
        due_date,
        assigned_user,
        status
      `
      )
      .eq("case_id", id)
      .order("due_date", {
        ascending: true,
        nullsFirst: false,
      }),

    supabase
      .from("case_products")
      .select(
        `
        id,
        line_type,
        product_id,
        package_id,
        quantity,
        purchase_price,
        sales_price,
        gross_profit,
        memo,
        products (
          name,
          model_no,
          category,
          manufacturers (
            name
          )
        ),
        packages (
          name
        ),
        suppliers (
          name
        )
      `
      )
      .eq("case_id", id)
      .order("created_at", { ascending: true }),

    supabase
      .from("orders")
      .select(
        `
        id,
        order_no,
        supplier_id,
        order_date,
        expected_delivery_date,
        delivered_date,
        order_amount,
        status,
        memo,
        suppliers (
          name
        )
      `
      )
      .eq("case_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_no,
        invoice_date,
        due_date,
        invoice_amount,
        status,
        memo
      `
      )
      .eq("case_id", id)
      .order("invoice_date", {
        ascending: false,
        nullsFirst: false,
      }),

    supabase
      .from("payments")
      .select(
        `
        id,
        invoice_id,
        payment_date,
        payment_amount,
        status,
        memo
      `
      )
      .eq("case_id", id)
      .order("payment_date", { ascending: false }),

    getCaseSettlementByCaseIdAdmin(id),
    loadThreePartyMoneyByCaseIdAdmin(id),
  ]);

  if (caseError || !caseData) {
    return (
      <div className="min-h-full bg-[#f7f7f5] p-8">
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-gray-900">案件詳細</h1>
          <p className="mt-3 text-sm text-red-700">
            案件取得エラー：
            {caseError?.message || "案件が見つかりません"}
          </p>
          <Link
            href="/cases"
            className="mt-5 inline-flex text-sm text-gray-600 hover:text-gray-900"
          >
            ← 案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  const dealer = getSingleRelation(caseData.dealers as Dealer | Dealer[] | null);

  const viewCase: CaseDetailViewData = {
    id: caseData.id as string,
    caseNo: (caseData.case_no as string) || "",
    status: (caseData.status as string) || null,
    createdAt: (caseData.created_at as string) || null,
    orderReceivedDate:
      (caseData.order_received_date as string) || null,
    dealerName: dealer?.name || "",
    dealerContact: dealer?.contact_name || "",
    customerName: (caseData.customer_name as string) || "",
    customerPhone: (caseData.customer_phone as string) || "",
    siteAddress: (caseData.site_address as string) || "",
    deliveryAddress: (caseData.delivery_address as string) || "",
    desiredDeliveryDate: (caseData.desired_delivery_date as string) || null,
    constructionDate:
      (caseData.construction_desired_date as string) || null,
    constructionCompletedDate:
      (caseData.construction_completed_date as string) || null,
    constructionDetail: (caseData.construction_detail as string) || "",
    orderType: (caseData.order_type as string) || "",
    assignedUser: (caseData.assigned_user as string) || "",
    department: (caseData.department as string) || "",
    priority: (caseData.priority as string) || "",
    memo: (caseData.memo as string) || "",
    productName: (caseData.product_name as string) || "",
    quantity:
      caseData.quantity != null ? String(caseData.quantity) : "",
  };

  const products: CaseProductRow[] = (caseProductsData || []).map((row) => {
    const product = getSingleRelation(
      row.products as ProductRelation | ProductRelation[] | null
    );
    const pkg = getSingleRelation(
      row.packages as PackageRelation | PackageRelation[] | null
    );
    const manufacturer = getSingleRelation(product?.manufacturers);
    const supplier = getSingleRelation(
      row.suppliers as SupplierRelation | SupplierRelation[] | null
    );

    return toCaseProductDisplayRow(row.id as string, {
      line_type: row.line_type as string | null,
      product_id: row.product_id as string | null,
      package_id: row.package_id as string | null,
      quantity: row.quantity as number | string | null,
      purchase_price: row.purchase_price as number | string | null,
      sales_price: row.sales_price as number | string | null,
      gross_profit: row.gross_profit as number | string | null,
      memo: (row.memo as string) || "",
      productName: product?.name || "",
      packageName: pkg?.name || "",
      modelNo: product?.model_no || "",
      category: product?.category || "",
      manufacturerName: manufacturer?.name || "",
      supplierName: supplier?.name || "",
    });
  });

  const ordersBase = (ordersData || []).map((row) => {
    const supplier = getSingleRelation(
      row.suppliers as SupplierRelation | SupplierRelation[] | null
    );

    return {
      id: row.id as string,
      orderNo: (row.order_no as string) || "",
      supplierId: (row.supplier_id as string) || null,
      supplierName: supplier?.name || "",
      orderDate: (row.order_date as string) || null,
      expectedDeliveryDate: (row.expected_delivery_date as string) || null,
      deliveredDate: (row.delivered_date as string) || null,
      orderAmount: toNumber(row.order_amount as number | string | null),
      status: (row.status as string) || "",
      memo: (row.memo as string) || "",
    };
  });

  const orderIds = ordersBase.map((o) => o.id);
  const rawLinesByOrder = new Map<
    string,
    Array<{
      id: string;
      product_id: string | null;
      case_product_id: string | null;
      quantity: number;
      unit_price: number | null;
      amount: number | null;
      memo: string | null;
      sort_order: number;
      manufacturer_name: string;
      model_no: string;
      product_name: string;
    }>
  >();
  if (orderIds.length > 0) {
    const { data: orderItemsData, error: orderItemsError } = await supabase
      .from("order_items")
      .select(
        `
        id,
        order_id,
        product_id,
        case_product_id,
        quantity,
        unit_price,
        amount,
        memo,
        sort_order,
        products (
          name,
          model_no,
          manufacturers (
            name
          )
        )
      `
      )
      .in("order_id", orderIds)
      .order("sort_order", { ascending: true });

    if (orderItemsError) {
      // 明細が取れなくても発注ヘッダは表示する（仕入/納品は空明細）
      console.error("order_items load failed:", orderItemsError.message);
    } else {
      for (const item of orderItemsData || []) {
        const orderId = String(item.order_id || "");
        if (!orderId) continue;
        const product = getSingleRelation(
          item.products as ProductRelation | ProductRelation[] | null
        );
        const identity = resolveProductIdentity(product);
        const list = rawLinesByOrder.get(orderId) || [];
        list.push({
          id: item.id as string,
          product_id: (item.product_id as string | null) || null,
          case_product_id: (item.case_product_id as string | null) || null,
          quantity: toNumber(item.quantity as number | string | null),
          unit_price: item.unit_price as number | null,
          amount: item.amount as number | null,
          memo: (item.memo as string | null) || null,
          sort_order: toNumber(item.sort_order as number | string | null),
          manufacturer_name: identity.manufacturerName,
          model_no: identity.modelNo,
          product_name: (product as { name?: string | null } | null)?.name || "",
        });
        rawLinesByOrder.set(orderId, list);
      }
    }
  }

  const orders: OrderRow[] = ordersBase.map((order) => {
    const raw = rawLinesByOrder.get(order.id) || [];
    const displayLines = buildOrderDisplayLines(raw);
    const deliveryRaw = buildDeliveryQuantityLines(raw);
    return {
      ...order,
      lines: displayLines.map((line) => {
        if (line.kind === "PACKAGE") {
          return {
            id: line.key,
            manufacturerName: "パッケージ",
            modelNo: line.package_name,
            quantity: line.quantity,
            unitPrice: line.unit_price,
            amount: line.amount,
            components: line.components.map((c) => ({
              id: c.key,
              manufacturerName: c.manufacturer_name,
              modelNo: c.model_no || c.product_name,
              quantity: c.quantity,
            })),
          };
        }
        return {
          id: line.key,
          manufacturerName: line.manufacturer_name,
          modelNo: line.model_no,
          quantity: line.quantity,
          unitPrice: line.unit_price,
          amount: line.amount,
        };
      }),
      deliveryLines: deliveryRaw.map((item) => ({
        id: item.id,
        manufacturerName: item.manufacturer_name || "",
        modelNo: item.model_no || "",
        quantity: toNumber(item.quantity),
        unitPrice: toNumber(item.unit_price),
        amount: toNumber(item.amount),
      })),
    };
  });

  const invoices: InvoiceRow[] = (invoicesData || []).map((row) => ({
    id: row.id as string,
    invoiceNo: (row.invoice_no as string) || "",
    invoiceDate: (row.invoice_date as string) || null,
    dueDate: (row.due_date as string) || null,
    invoiceAmount: toNumber(row.invoice_amount as number | string | null),
    status: (row.status as string) || "",
    memo: (row.memo as string) || "",
  }));

  const payments: PaymentRow[] = (paymentsData || []).map((row) => ({
    id: row.id as string,
    invoiceId: (row.invoice_id as string) || null,
    paymentDate: (row.payment_date as string) || null,
    paymentAmount: toNumber(row.payment_amount as number | string | null),
    status: (row.status as string) || "",
    memo: (row.memo as string) || "",
  }));

  const tasks: TaskRow[] = (tasksData || []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) || "",
    dueDate: (row.due_date as string) || null,
    assignedUser: (row.assigned_user as string) || "",
    status: (row.status as string) || null,
  }));

  // 読取失敗は未設定(null)と同一視しない
  const settlementRow =
    settlementResult.ok && settlementResult.data
      ? settlementResult.data
      : null;
  const settlementError = settlementResult.ok
    ? undefined
    : settlementResult.error_message;
  const settlement = settlementRow
    ? toSettlementViewData(settlementRow)
    : null;

  // カラム未適用時は settlement.memo メタの完工日を使う
  if (
    !viewCase.constructionCompletedDate &&
    settlement?.constructionCompletedDateFromMeta
  ) {
    viewCase.constructionCompletedDate =
      settlement.constructionCompletedDateFromMeta;
  }

  const workflow = evaluateWorkflow(
    buildWorkflowContext({
      settlement: settlementRow,
      constructionCompletedDate: viewCase.constructionCompletedDate,
      orders,
      invoices,
      payments,
    })
  );

  return (
    <CaseDetailView
      caseData={viewCase}
      products={products}
      orders={orders}
      invoices={invoices}
      payments={payments}
      tasks={tasks}
      settlement={settlement}
      workflow={workflow}
      dealerPaymentType={dealer?.payment_type || undefined}
      dealerId={(caseData.dealer_id as string) || null}
      threePartyMoney={threePartyMoney}
      initialTab={resolveCaseDetailTabId(tabParam)}
      errors={{
        products: caseProductsError?.message,
        orders: ordersError?.message,
        invoices: invoicesError?.message,
        payments: paymentsError?.message,
        tasks: tasksError?.message,
        settlement: settlementError,
      }}
    />
  );
}
