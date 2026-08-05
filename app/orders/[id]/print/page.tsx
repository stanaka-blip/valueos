"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { listOrderItemsByOrderId } from "@/lib/repositories/orderItems";
import type { OrderItemRow } from "@/lib/database.types";
import { formatDate, formatYen, toNumber } from "../../orderUtils";
import {
  displayIdentityValue,
  resolveProductIdentity,
} from "../../productIdentity";

import PrintButton from "./PrintButton";

type OrderRow = {
  id: string;
  case_id: string | null;
  order_no: string | null;
  status: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  order_amount: number | null;
  memo: string | null;
  suppliers: { name: string | null } | { name: string | null }[] | null;
};

type CaseRow = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  site_address: string | null;
  delivery_address: string | null;
};

type PrintLine = OrderItemRow & {
  manufacturer_name: string;
  model_no: string;
  product_name: string;
};

function supplierNameOf(order: OrderRow | null): string {
  if (!order?.suppliers) return "—";
  if (Array.isArray(order.suppliers)) return order.suppliers[0]?.name ?? "—";
  return order.suppliers.name ?? "—";
}

function displayText(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  return trimmed || "—";
}

export default function OrderPrintPage() {
  const params = useParams();
  const orderId = typeof params.id === "string" ? params.id : "";

  const orderIdError = !orderId ? "発注IDが不正です" : null;

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [items, setItems] = useState<PrintLine[]>([]);
  const [loading, setLoading] = useState(!orderIdError);
  const [error, setError] = useState<string | null>(orderIdError);

  useEffect(() => {
    if (orderIdError) {
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select(
            "id, case_id, order_no, status, order_date, expected_delivery_date, order_amount, memo, suppliers(name)"
          )
          .eq("id", orderId)
          .maybeSingle();
        if (orderError) throw orderError;
        if (!orderData) throw new Error("発注が見つかりません");
        if (cancelled) return;

        const typedOrder = orderData as unknown as OrderRow;
        setOrder(typedOrder);

        if (typedOrder.case_id) {
          const { data: caseData, error: caseError } = await supabase
            .from("cases")
            .select(
              "id, case_no, customer_name, site_address, delivery_address"
            )
            .eq("id", typedOrder.case_id)
            .maybeSingle();
          if (caseError) throw caseError;
          if (!cancelled) setCaseRow((caseData as CaseRow | null) ?? null);
        }

        const itemsResult = await listOrderItemsByOrderId(orderId);
        if (itemsResult.error) {
          throw new Error(itemsResult.error);
        }

        const productIds = itemsResult.data
          .map((item) => item.product_id)
          .filter((value): value is string => Boolean(value));

        const productMap = new Map<
          string,
          { manufacturer_name: string; model_no: string; product_name: string }
        >();
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from("products")
            .select("id, name, model_no, manufacturers(name)")
            .in("id", productIds);
          for (const product of products || []) {
            const identity = resolveProductIdentity(
              product as {
                model_no?: string | null;
                manufacturers?:
                  | { name?: string | null }
                  | { name?: string | null }[]
                  | null;
              }
            );
            productMap.set(product.id as string, {
              manufacturer_name: identity.manufacturerName,
              model_no: identity.modelNo,
              product_name: (product.name as string | null) || "",
            });
          }
        }

        if (!cancelled) {
          // order_items は構成品・単体商品行のみ（PACKAGE親行は保存されない）
          setItems(
            itemsResult.data.map((item) => {
              const product = item.product_id
                ? productMap.get(item.product_id)
                : undefined;
              return {
                ...item,
                manufacturer_name: product?.manufacturer_name || "",
                model_no: product?.model_no || "",
                product_name: product?.product_name || "",
              };
            })
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "発注の取得に失敗しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, orderIdError]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-8 text-sm text-slate-600">
        読み込み中…
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-white p-8 text-sm text-red-600">
        {error ?? "発注が見つかりません"}
      </main>
    );
  }

  const total =
    items.length > 0
      ? items.reduce((sum, item) => sum + toNumber(item.amount), 0)
      : toNumber(order.order_amount);

  const deliveryAddress =
    (caseRow?.delivery_address || "").trim() ||
    (caseRow?.site_address || "").trim() ||
    "";

  return (
    <>
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-4 px-4 py-5 print:hidden">
        <Link
          href={`/orders/${order.id}`}
          className="rounded-lg border bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ← 発注詳細へ戻る
        </Link>
        <PrintButton />
      </div>

      <main className="order-print-page mx-auto bg-white text-gray-900">
        <header className="order-print-header border-b-2 border-gray-900 pb-5">
          <h1 className="text-3xl font-bold tracking-[0.3em]">発 注 書</h1>
          <div className="mt-5 grid gap-2 text-sm md:grid-cols-2">
            <p>
              発注番号：
              <span className="ml-1 font-medium">
                {displayText(order.order_no)}
              </span>
            </p>
            <p>
              発注日：
              <span className="ml-1 font-medium">
                {formatDate(order.order_date)}
              </span>
            </p>
            <p>
              納品予定日：
              <span className="ml-1 font-medium">
                {formatDate(order.expected_delivery_date)}
              </span>
            </p>
            <p>
              発注ステータス：
              <span className="ml-1 font-medium">
                {displayText(order.status)}
              </span>
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <p className="border-b border-gray-700 pb-2 text-xl font-bold">
              {supplierNameOf(order)} 御中
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <Info label="案件番号" value={caseRow?.case_no} />
            <Info label="顧客名" value={caseRow?.customer_name} />
            <Info label="現場住所" value={caseRow?.site_address} />
            <Info
              label="納品先住所"
              value={deliveryAddress || null}
            />
          </div>
        </section>

        <section className="mt-8">
          <table className="order-print-table w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-900 text-left">
                <th className="py-2 pr-2 font-semibold">メーカー</th>
                <th className="py-2 pr-2 font-semibold">型番</th>
                <th className="py-2 pr-2 font-semibold">商品名</th>
                <th className="py-2 pr-2 text-right font-semibold">数量</th>
                <th className="py-2 pr-2 text-right font-semibold">単価</th>
                <th className="py-2 pr-2 text-right font-semibold">金額</th>
                <th className="py-2 font-semibold">備考</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-4 text-center text-gray-500"
                  >
                    明細なし
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="order-print-row border-b border-gray-300"
                  >
                    <td className="py-2 pr-2 align-top">
                      {displayIdentityValue(item.manufacturer_name)}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      {displayIdentityValue(item.model_no)}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      {displayText(item.product_name)}
                    </td>
                    <td className="py-2 pr-2 text-right align-top tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-2 pr-2 text-right align-top tabular-nums">
                      {formatYen(toNumber(item.unit_price))}
                    </td>
                    <td className="py-2 pr-2 text-right align-top tabular-nums">
                      {formatYen(toNumber(item.amount))}
                    </td>
                    <td className="py-2 align-top whitespace-pre-wrap">
                      {displayText(item.memo)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex justify-end">
          <div className="min-w-[220px] border-2 border-gray-900 p-4">
            <p className="text-sm font-bold">発注合計</p>
            <p className="mt-2 text-right text-2xl font-bold tabular-nums">
              {formatYen(total)}
            </p>
          </div>
        </section>

        {order.memo ? (
          <section className="mt-8 text-sm">
            <p className="font-bold text-gray-700">発注備考</p>
            <p className="mt-2 whitespace-pre-wrap border border-gray-300 p-3">
              {order.memo}
            </p>
          </section>
        ) : null}

        <footer className="mt-12 border-t border-gray-400 pt-4 text-xs text-gray-600">
          本発注書はValueOSより出力されました
        </footer>
      </main>

      <style>{`
        .order-print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          background: white;
        }

        .order-print-table thead {
          display: table-header-group;
        }

        .order-print-row {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .order-print-header {
          break-after: avoid;
          page-break-after: avoid;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          html,
          body {
            background: white !important;
          }

          body * {
            visibility: hidden;
          }

          .order-print-page,
          .order-print-page * {
            visibility: visible;
          }

          .order-print-page {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: 15mm;
            box-shadow: none;
          }
        }
      `}</style>
    </>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm text-gray-900">
        {displayText(value)}
      </p>
    </div>
  );
}
