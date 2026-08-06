"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { parseCaseExtras } from "@/app/admin/orders/parseCaseExtras";
import { PrintCompanyFooter } from "@/app/components/print/CompanyPrintBlocks";
import { fetchCompanySettingsForPrint } from "@/lib/companyInfo/fetchCompanySettingsForPrint";
import type { PrintCompanyInfo } from "@/lib/companyInfo/printCompanyInfo";
import { supabase } from "@/lib/supabase";
import { listOrderItemsByOrderId } from "@/lib/repositories/orderItems";
import type { OrderItemRow } from "@/lib/database.types";
import { formatDate } from "../../orderUtils";
import {
  displayIdentityValue,
  resolveProductIdentity,
} from "../../productIdentity";

import PrintButton from "../print/PrintButton";

type OrderRow = {
  id: string;
  case_id: string | null;
  order_no: string | null;
  delivered_date: string | null;
  memo: string | null;
};

type CaseRow = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  site_address: string | null;
  delivery_address: string | null;
  memo: string | null;
};

type PrintLine = OrderItemRow & {
  manufacturer_name: string;
  model_no: string;
  product_name: string;
};

function displayText(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  return trimmed || "—";
}

export default function DeliveryPrintPage() {
  const params = useParams();
  const orderId = typeof params.id === "string" ? params.id : "";

  const orderIdError = !orderId ? "発注IDが不正です" : null;

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [items, setItems] = useState<PrintLine[]>([]);
  const [company, setCompany] = useState<PrintCompanyInfo | null>(null);
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
        const companyLoad = await fetchCompanySettingsForPrint();
        if (!companyLoad.ok) {
          throw new Error(
            `会社情報の取得に失敗しました：${companyLoad.error_message}`
          );
        }
        if (cancelled) return;
        setCompany(companyLoad.data);

        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select("id, case_id, order_no, delivered_date, memo")
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
              "id, case_no, customer_name, site_address, delivery_address, memo"
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

  if (error || !order || !company) {
    return (
      <main className="min-h-screen bg-white p-8 text-sm text-red-600">
        {error ?? "発注が見つかりません"}
      </main>
    );
  }

  const deliveryAddress =
    (caseRow?.delivery_address || "").trim() ||
    (caseRow?.site_address || "").trim() ||
    "";

  const caseExtras = parseCaseExtras({
    memo: caseRow?.memo,
    constructionDetail: null,
  });

  const orderMemo = (order.memo || "").trim();

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
        <header className="order-print-header">
          <div className="order-print-header-row">
            <h1 className="order-print-title">納品書</h1>
            <dl className="order-print-meta">
              <div className="order-print-meta-item">
                <dt>発注番号</dt>
                <dd>{displayText(order.order_no)}</dd>
              </div>
              <div className="order-print-meta-item">
                <dt>納品日</dt>
                <dd>
                  {order.delivered_date
                    ? formatDate(order.delivered_date)
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="order-print-header-rule" aria-hidden="true" />
        </header>

        <section className="order-print-top">
          <div className="order-print-top-left">
            <h2 className="order-print-section-title">納品先</h2>
            <div className="order-print-fields">
              <FieldRow label="顧客名" value={caseRow?.customer_name} />
              <FieldRow label="納品先住所" value={deliveryAddress || null} />
              <FieldRow
                label="納品先電話番号"
                value={caseExtras.receiverPhone}
              />
              <FieldRow
                label="荷受け担当者"
                value={caseExtras.receiverName}
              />
            </div>
          </div>

          <div className="order-print-top-right">
            <h2 className="order-print-section-title">案件情報</h2>
            <div className="order-print-fields">
              <FieldRow label="案件番号" value={caseRow?.case_no} />
            </div>
          </div>
        </section>

        <section className="order-print-lines">
          <table className="order-print-table w-full border-collapse">
            <thead>
              <tr>
                <th>メーカー</th>
                <th>型番</th>
                <th>商品名</th>
                <th className="order-print-num">数量</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="order-print-empty">
                    明細なし
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="order-print-row">
                    <td>{displayIdentityValue(item.manufacturer_name)}</td>
                    <td>{displayIdentityValue(item.model_no)}</td>
                    <td>{displayText(item.product_name)}</td>
                    <td className="order-print-num tabular-nums">
                      {item.quantity}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {orderMemo ? (
          <section className="order-print-notes">
            <p className="order-print-notes-heading">【備考】</p>
            <div className="order-print-notes-body whitespace-pre-wrap">
              {orderMemo}
            </div>
          </section>
        ) : null}

        <PrintCompanyFooter
          company={company}
          attribution="本納品書は ValueOS より出力されました"
        />
      </main>

      <style>{`
        .order-print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 14mm 16mm 12mm;
          background: white;
          color: #111827;
          font-size: 10.5pt;
          line-height: 1.55;
        }

        .order-print-header {
          break-after: avoid;
          page-break-after: avoid;
        }

        .order-print-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
        }

        .order-print-title {
          margin: 0;
          font-size: 22pt;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: #111827;
        }

        .order-print-meta {
          margin: 0;
          min-width: 220px;
          display: grid;
          gap: 8px;
        }

        .order-print-meta-item {
          display: grid;
          grid-template-columns: 6.5em 1fr;
          gap: 12px;
          align-items: baseline;
        }

        .order-print-meta-item dt {
          margin: 0;
          font-size: 9pt;
          font-weight: 500;
          color: #6b7280;
        }

        .order-print-meta-item dd {
          margin: 0;
          font-size: 10.5pt;
          font-weight: 500;
          color: #111827;
          text-align: right;
        }

        .order-print-header-rule {
          margin-top: 18px;
          border-top: 1px solid #d1d5db;
        }

        .order-print-top {
          margin-top: 28px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }

        .order-print-section-title {
          margin: 0 0 16px;
          font-size: 10.5pt;
          font-weight: 600;
          color: #111827;
        }

        .order-print-fields {
          display: grid;
          gap: 12px;
        }

        .order-print-field {
          display: grid;
          grid-template-columns: 7.5em 1fr;
          gap: 12px;
          align-items: start;
        }

        .order-print-field-label {
          font-size: 9pt;
          font-weight: 500;
          color: #6b7280;
        }

        .order-print-field-value {
          font-size: 10.5pt;
          color: #111827;
          word-break: break-word;
        }

        .order-print-lines {
          margin-top: 32px;
        }

        .order-print-table {
          font-size: 9.5pt;
        }

        .order-print-table thead {
          display: table-header-group;
        }

        .order-print-table thead th {
          padding: 12px 10px;
          background: #1f2937;
          color: #ffffff;
          font-size: 9pt;
          font-weight: 600;
          text-align: left;
          border: none;
        }

        .order-print-table thead th.order-print-num {
          text-align: right;
        }

        .order-print-table tbody td {
          padding: 14px 10px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
          color: #111827;
        }

        .order-print-table tbody td.order-print-num {
          text-align: right;
        }

        .order-print-empty {
          padding: 24px 10px !important;
          text-align: center;
          color: #6b7280;
        }

        .order-print-row {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .order-print-notes {
          margin-top: 32px;
        }

        .order-print-notes-heading {
          margin: 0 0 10px;
          font-size: 10pt;
          font-weight: 600;
          color: #374151;
        }

        .order-print-notes-body {
          min-height: 72px;
          padding: 16px 18px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background: #fafafa;
          font-size: 10pt;
          color: #111827;
        }

        .order-print-footer {
          margin-top: 36px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          text-align: left;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .order-print-footer-company {
          margin: 0 0 6px;
          font-size: 11pt;
          font-weight: 700;
          color: #111827;
        }

        .order-print-footer-meta {
          margin: 0 0 4px;
          font-size: 9pt;
          color: #374151;
        }

        .order-print-footer-note {
          margin: 0;
          font-size: 8pt;
          color: #9ca3af;
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
            padding: 14mm 16mm 12mm;
            box-shadow: none;
          }

          .order-print-table thead th {
            background: #1f2937 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .order-print-notes-body {
            background: #fafafa !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="order-print-field">
      <span className="order-print-field-label">{label}</span>
      <span className="order-print-field-value">{displayText(value)}</span>
    </div>
  );
}
