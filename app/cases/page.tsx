import { supabase } from "@/lib/supabase";

import CasesList, { type CasesListItem } from "./CasesList";

export const dynamic = "force-dynamic";

type DealerRelation = {
  name: string | null;
};

type CaseProductAmount = {
  sales_price: number | string | null;
  gross_profit: number | string | null;
};

type CaseListRow = {
  id: string;
  case_no: string | null;
  created_at: string | null;
  customer_name: string | null;
  order_type: string | null;
  status: string | null;
  department: string | null;
  assigned_user: string | null;
  desired_delivery_date: string | null;
  priority: string | null;
  dealers: DealerRelation | DealerRelation[] | null;
  case_products: CaseProductAmount[] | null;
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

export default async function CasesPage() {
  const { data: cases, error } = await supabase
    .from("cases")
    .select(
      `
      id,
      case_no,
      created_at,
      customer_name,
      order_type,
      status,
      department,
      assigned_user,
      desired_delivery_date,
      priority,
      dealers (
        name
      ),
      case_products (
        sales_price,
        gross_profit
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="min-h-full bg-[#f7f7f5]">
        <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
          <h1 className="text-xl font-semibold text-gray-900">案件管理</h1>
        </header>
        <div className="p-6 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            データ取得エラー：{error.message}
          </div>
        </div>
      </div>
    );
  }

  const items: CasesListItem[] = ((cases || []) as unknown as CaseListRow[]).map(
    (row) => {
      const dealer = getSingleRelation(row.dealers);
      const products = Array.isArray(row.case_products) ? row.case_products : [];
      const salesTotal = products.reduce(
        (sum, product) => sum + toNumber(product.sales_price),
        0
      );
      const profitTotal = products.reduce(
        (sum, product) => sum + toNumber(product.gross_profit),
        0
      );

      return {
        id: row.id,
        caseNo: row.case_no || "",
        createdAt: row.created_at,
        dealerName: dealer?.name || "",
        customerName: row.customer_name || "",
        orderType: row.order_type || "",
        status: row.status,
        department: row.department || "",
        assignedUser: row.assigned_user || "",
        desiredDeliveryDate: row.desired_delivery_date,
        priority: row.priority || "中",
        salesTotal,
        profitTotal,
      };
    }
  );

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          案件管理
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          卸案件の進捗・利益を管理します（全{items.length}件）
        </p>
      </header>

      <div className="p-6 md:p-8">
        <CasesList items={items} />
      </div>
    </div>
  );
}
