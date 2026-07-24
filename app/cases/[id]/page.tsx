import Link from "next/link";

import { supabase } from "@/lib/supabase";

import CaseDetailView, {
  type CaseDetailViewData,
  type CasePackageView,
  type CaseProductRow,
  type InvoiceRow,
  type OrderRow,
  type PaymentRow,
  type TaskRow,
} from "./CaseDetailView";
import { toSettlementViewData } from "./settlementView";
import { getCaseSettlementByCaseId } from "@/lib/repositories/caseSettlements";

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
  package_code: string | null;
};

type CasePackageItemRelation = {
  id: string;
  quantity: number | string | null;
  is_selected: boolean | null;
  is_added_manually: boolean | null;
  is_hidden: boolean | null;
  product_name_snapshot: string | null;
  model_no_snapshot: string | null;
  display_name_snapshot: string | null;
  products:
    | {
        name: string | null;
        model_no: string | null;
      }
    | {
        name: string | null;
        model_no: string | null;
      }[]
    | null;
};

type CasePackageRelation = {
  id: string;
  quantity: number | string | null;
  memo: string | null;
  package_name_snapshot: string | null;
  package_code_snapshot: string | null;
  manufacturer_name_snapshot: string | null;
  series_name_snapshot: string | null;
  packages: PackageRelation | PackageRelation[] | null;
  case_package_items: CasePackageItemRelation[] | CasePackageItemRelation | null;
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
    { data: casePackagesData, error: casePackagesError },
    { data: ordersData, error: ordersError },
    { data: invoicesData, error: invoicesError },
    { data: paymentsData, error: paymentsError },
    settlementResult,
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
        suppliers (
          name
        )
      `
      )
      .eq("case_id", id)
      .order("created_at", { ascending: true }),

    supabase
      .from("case_packages")
      .select(
        `
        id,
        quantity,
        memo,
        package_name_snapshot,
        package_code_snapshot,
        manufacturer_name_snapshot,
        series_name_snapshot,
        packages (
          name,
          package_code
        ),
        case_package_items (
          id,
          quantity,
          is_selected,
          is_added_manually,
          is_hidden,
          product_name_snapshot,
          model_no_snapshot,
          display_name_snapshot,
          products (
            name,
            model_no
          )
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

    getCaseSettlementByCaseId(id),
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
      category: product?.category || "",
      manufacturerName: manufacturer?.name || "",
      supplierName: supplier?.name || "",
      quantity: row.quantity != null ? String(row.quantity) : "",
      purchasePrice: toNumber(row.purchase_price as number | string | null),
      salesPrice: toNumber(row.sales_price as number | string | null),
      grossProfit: toNumber(row.gross_profit as number | string | null),
      memo: (row.memo as string) || "",
    };
  });

  const packages: CasePackageView[] = (
    (casePackagesData || []) as CasePackageRelation[]
  ).map((pkg) => {
    const relatedPackage = getSingleRelation(pkg.packages);
    const rawItems = Array.isArray(pkg.case_package_items)
      ? pkg.case_package_items
      : pkg.case_package_items
        ? [pkg.case_package_items]
        : [];

    const items = rawItems
      .filter(
        (item) =>
          item.is_added_manually !== true &&
          item.is_selected !== false &&
          item.is_hidden !== true
      )
      .map((item) => {
        const relatedProduct = getSingleRelation(item.products);
        const productName =
          item.display_name_snapshot ||
          item.product_name_snapshot ||
          relatedProduct?.name ||
          "";
        const modelNo =
          item.model_no_snapshot || relatedProduct?.model_no || "";

        return {
          id: item.id,
          productName,
          modelNo,
          quantity: item.quantity != null ? String(item.quantity) : "",
        };
      });

    return {
      id: pkg.id,
      manufacturerName: pkg.manufacturer_name_snapshot || "",
      seriesName: pkg.series_name_snapshot || "",
      packageName:
        pkg.package_name_snapshot || relatedPackage?.name || "",
      quantity: pkg.quantity != null ? String(pkg.quantity) : "",
      memo: pkg.memo || "",
      items,
    };
  });

  const productsErrorMessage =
    caseProductsError?.message || casePackagesError?.message;

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

  const settlement = settlementResult.data
    ? toSettlementViewData(settlementResult.data)
    : null;

  return (
    <CaseDetailView
      caseData={viewCase}
      products={products}
      packages={packages}
      orders={orders}
      invoices={invoices}
      payments={payments}
      tasks={tasks}
      settlement={settlement}
      dealerPaymentType={dealer?.payment_type || undefined}
      errors={{
        products: productsErrorMessage,
        orders: ordersError?.message,
        invoices: invoicesError?.message,
        payments: paymentsError?.message,
        tasks: tasksError?.message,
        settlement: settlementResult.error || undefined,
      }}
    />
  );
}
