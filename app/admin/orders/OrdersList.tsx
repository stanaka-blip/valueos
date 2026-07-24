"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

import { buildProductSummary } from "./productSummary";
import {
  ORDER_STATUS_FILTERS,
  type OrderStatusFilterValue,
  getStatusBadgeClassName,
  getStatusDisplayLabel,
  matchesStatusFilter,
} from "./status";

type DealerRelation = {
  name: string | null;
} | null;

type CasePackageRow = {
  package_name_snapshot: string | null;
  packages: { name: string | null } | { name: string | null }[] | null;
} | null;

type CaseProductRow = {
  products: { name: string | null } | { name: string | null }[] | null;
} | null;

type OrderCaseRow = {
  id: string;
  case_no: string | null;
  created_at: string | null;
  customer_name: string | null;
  order_type: string | null;
  product_name: string | null;
  desired_delivery_date: string | null;
  status: string | null;
  dealers: DealerRelation | DealerRelation[];
  case_packages: CasePackageRow[] | CasePackageRow | null;
  case_products: CaseProductRow[] | CaseProductRow | null;
};

type OrderListItem = {
  id: string;
  caseNo: string;
  dealerName: string;
  customerName: string;
  productSummary: string;
  desiredDeliveryDate: string;
  status: string | null;
  createdAt: string | null;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] || null : value;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ja-JP");
}

function toListItem(row: OrderCaseRow): OrderListItem {
  const dealer = getSingleRelation(row.dealers);

  return {
    id: row.id,
    caseNo: row.case_no || "-",
    dealerName: dealer?.name || "-",
    customerName: row.customer_name || "-",
    productSummary: buildProductSummary({
      orderType: row.order_type,
      productName: row.product_name,
      casePackages: row.case_packages,
      caseProducts: row.case_products,
    }),
    desiredDeliveryDate: row.desired_delivery_date || "-",
    status: row.status,
    createdAt: row.created_at,
  };
}

export default function OrdersList() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<OrderStatusFilterValue>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("cases")
        .select(
          `
          id,
          case_no,
          created_at,
          customer_name,
          order_type,
          product_name,
          desired_delivery_date,
          status,
          dealers (
            name
          ),
          case_packages (
            package_name_snapshot,
            packages (
              name
            )
          ),
          case_products (
            products (
              name
            )
          )
        `
        )
        .order("created_at", { ascending: false });

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("受注一覧の取得に失敗しました:", error);
        setOrders([]);
        setErrorMessage("受注データの取得に失敗しました");
        setLoading(false);
        return;
      }

      setOrders(((data as OrderCaseRow[] | null) || []).map(toListItem));
      setLoading(false);
    }

    loadOrders();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return orders.filter((order) => {
      if (!matchesStatusFilter(order.status, statusFilter)) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const haystack = [
        order.caseNo,
        order.customerName,
        order.dealerName,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedKeyword);
    });
  }, [orders, keyword, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <label className="block">
            <span className="text-sm font-bold text-gray-700">検索</span>
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="案件番号・顧客名・販売店名"
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-gray-700">ステータス</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as OrderStatusFilterValue)
              }
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            >
              {ORDER_STATUS_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl bg-white p-8 text-sm text-gray-600 shadow-sm">
          読み込み中...
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!loading && !errorMessage && filteredOrders.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          受注データがありません
        </div>
      ) : null}

      {!loading && !errorMessage && filteredOrders.length > 0 ? (
        <>
          <p className="text-sm text-gray-500">
            表示件数：{filteredOrders.length}件
          </p>

          {/* PC: table */}
          <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm md:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-4">案件番号</th>
                  <th className="px-4 py-4">販売店</th>
                  <th className="px-4 py-4">顧客名</th>
                  <th className="px-4 py-4">商品</th>
                  <th className="px-4 py-4">希望納品日</th>
                  <th className="px-4 py-4">ステータス</th>
                  <th className="px-4 py-4">登録日</th>
                  <th className="px-4 py-4">詳細</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="px-4 py-4 font-bold text-gray-900">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {order.caseNo}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-gray-900">
                      {order.dealerName}
                    </td>
                    <td className="px-4 py-4">{order.customerName}</td>
                    <td className="px-4 py-4">{order.productSummary}</td>
                    <td className="px-4 py-4">
                      {order.desiredDeliveryDate}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-4">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {filteredOrders.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className="block rounded-xl bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-blue-600">
                      {order.caseNo}
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {order.customerName}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">販売店</dt>
                    <dd className="text-right text-gray-900">
                      {order.dealerName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">商品</dt>
                    <dd className="text-right text-gray-900">
                      {order.productSummary}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">希望納品日</dt>
                    <dd className="text-right text-gray-900">
                      {order.desiredDeliveryDate}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">登録日</dt>
                    <dd className="text-right text-gray-900">
                      {formatDate(order.createdAt)}
                    </dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getStatusBadgeClassName(status)}`}
    >
      {getStatusDisplayLabel(status)}
    </span>
  );
}
