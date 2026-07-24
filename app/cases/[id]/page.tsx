import Link from "next/link";

import { supabase } from "@/lib/supabase";

import CaseDetailView, {
  type CaseDetailViewData,
  type CaseProductRow,
  type InvoiceRow,
  type OrderRow,
  type PaymentRow,
  type TaskRow,
} from "./CaseDetailView";

export const dynamic = "force-dynamic";

type Dealer = {
  name: string | null;
  contact_name: string | null;
};

type ManufacturerRelation = {
  name: string | null;
};

type ProductRelation = {
  name: string | null;
  model_no: string | null;
  manufacturers: ManufacturerRelation | ManufacturerRelation[] | null;
};

type SupplierRelation = {
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [
    { data: caseData, error: caseError },
    { data: tasksData, error: tasksError },
    { data: caseProductsData, error: caseProductsError },
    { data: ordersData, error: ordersError },
    { data: invoicesData, error: invoicesError },
    { data: paymentsData, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select(
        `
        *,
        dealers (
          name,
          contact_name
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
        quantity,
        purchase_price,
        sales_price,
        gross_profit,
        memo,
        products (
          name,
          model_no,
          manufacturers (
            name
          )
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
    dealerName: dealer?.name || "",
    dealerContact: dealer?.contact_name || "",
    customerName: (caseData.customer_name as string) || "",
    customerPhone: (caseData.customer_phone as string) || "",
    siteAddress: (caseData.site_address as string) || "",
    deliveryAddress: (caseData.delivery_address as string) || "",
    desiredDeliveryDate: (caseData.desired_delivery_date as string) || null,
    constructionDate:
      (caseData.construction_desired_date as string) || null,
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
    const manufacturer = getSingleRelation(product?.manufacturers);
    const supplier = getSingleRelation(
      row.suppliers as SupplierRelation | SupplierRelation[] | null
    );

    return {
      id: row.id as string,
      productName: product?.name || "",
      modelNo: product?.model_no || "",
      manufacturerName: manufacturer?.name || "",
      supplierName: supplier?.name || "",
      quantity: row.quantity != null ? String(row.quantity) : "",
      purchasePrice: toNumber(row.purchase_price as number | string | null),
      salesPrice: toNumber(row.sales_price as number | string | null),
      grossProfit: toNumber(row.gross_profit as number | string | null),
      memo: (row.memo as string) || "",
    };
  });

  const orders: OrderRow[] = (ordersData || []).map((row) => {
    const supplier = getSingleRelation(
      row.suppliers as SupplierRelation | SupplierRelation[] | null
    );

    return {
      id: row.id as string,
      orderNo: (row.order_no as string) || "",
      supplierName: supplier?.name || "",
      orderDate: (row.order_date as string) || null,
      expectedDeliveryDate: (row.expected_delivery_date as string) || null,
      deliveredDate: (row.delivered_date as string) || null,
      orderAmount: toNumber(row.order_amount as number | string | null),
      status: (row.status as string) || "",
      memo: (row.memo as string) || "",
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

  return (
    <CaseDetailView
      caseData={viewCase}
      products={products}
      orders={orders}
      invoices={invoices}
      payments={payments}
      tasks={tasks}
      errors={{
        products: caseProductsError?.message,
        orders: ordersError?.message,
        invoices: invoicesError?.message,
        payments: paymentsError?.message,
        tasks: tasksError?.message,
      }}
    />
  );
}
