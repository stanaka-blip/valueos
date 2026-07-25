"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { listOrderItemsByOrderId } from "@/lib/repositories/orderItems";
import type { OrderItemRow } from "@/lib/database.types";
import { formatDate, formatYen, toNumber } from "../../orderUtils";

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
};

type PrintLine = OrderItemRow & {
  product_name: string;
};

function supplierNameOf(order: OrderRow | null): string {
  if (!order?.suppliers) return "—";
  if (Array.isArray(order.suppliers)) return order.suppliers[0]?.name ?? "—";
  return order.suppliers.name ?? "—";
}

export default function OrderPrintPage() {
  const params = useParams();
  const orderId = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [items, setItems] = useState<PrintLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("発注IDが不正です");
      setLoading(false);
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
            .select("id, case_no, customer_name")
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

        const productMap = new Map<string, string>();
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from("products")
            .select("id, name")
            .in("id", productIds);
          for (const product of products || []) {
            productMap.set(
              product.id as string,
              (product.name as string | null) || "（商品名なし）"
            );
          }
        }

        if (!cancelled) {
          setItems(
            itemsResult.data.map((item) => ({
              ...item,
              product_name: item.product_id
                ? productMap.get(item.product_id) || "（商品名なし）"
                : "（商品名なし）",
            }))
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
  }, [orderId]);

  useEffect(() => {
    if (!loading && order && !error) {
      const timer = window.setTimeout(() => window.print(), 300);
      return () => window.clearTimeout(timer);
    }
  }, [loading, order, error]);

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

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white p-8 text-slate-900 print:p-6">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-slate-500">印刷プレビュー</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          印刷
        </button>
      </div>

      <header className="mb-8 border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold tracking-wide">発注書</h1>
        <p className="mt-1 text-sm text-slate-600">ValueOS</p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500">発注番号</p>
          <p className="font-medium">{order.order_no ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">発注日</p>
          <p className="font-medium">{formatDate(order.order_date)}</p>
        </div>
        <div>
          <p className="text-slate-500">仕入先</p>
          <p className="font-medium">{supplierNameOf(order)}</p>
        </div>
        <div>
          <p className="text-slate-500">納品予定日</p>
          <p className="font-medium">{formatDate(order.expected_delivery_date)}</p>
        </div>
        <div>
          <p className="text-slate-500">ステータス</p>
          <p className="font-medium">{order.status ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">案件</p>
          <p className="font-medium">
            {caseRow
              ? `${caseRow.case_no ?? "—"} / ${caseRow.customer_name ?? "—"}`
              : "—"}
          </p>
        </div>
      </section>

      <section className="mb-6">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="py-2 pr-2 font-semibold">商品名</th>
              <th className="py-2 pr-2 text-right font-semibold">数量</th>
              <th className="py-2 pr-2 text-right font-semibold">単価</th>
              <th className="py-2 text-right font-semibold">金額</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  明細なし
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="py-2 pr-2">
                    {item.product_name}
                    {item.memo ? (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {item.memo}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {formatYen(toNumber(item.unit_price))}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatYen(toNumber(item.amount))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right font-semibold">
                合計
              </td>
              <td className="pt-3 text-right font-semibold tabular-nums">
                {formatYen(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {order.memo ? (
        <section className="mb-6 text-sm">
          <p className="text-slate-500">備考</p>
          <p className="mt-1 whitespace-pre-wrap">{order.memo}</p>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-500">
        本発注書は ValueOS より出力されました。
      </footer>
    </main>
  );
}
