"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { parseCaseExtras } from "@/app/admin/orders/parseCaseExtras";
import { PrintCompanyFooter } from "@/app/components/print/CompanyPrintBlocks";
import { fetchCompanySettingsForPrint } from "@/lib/companyInfo/fetchCompanySettingsForPrint";
import type { PrintCompanyInfo } from "@/lib/companyInfo/printCompanyInfo";
import { buildOrderPrintTaxDisplay } from "@/lib/orders/orderPrintTaxDisplay";
import {
  buildOrderDisplayLines,
  type OrderDisplayLine,
} from "@/lib/orders/orderPackageDisplay";
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
  customer_phone: string | null;
  site_address: string | null;
  delivery_address: string | null;
  desired_delivery_date: string | null;
  memo: string | null;
  construction_detail: string | null;
};

type EnrichedItem = OrderItemRow & {
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
  const [items, setItems] = useState<EnrichedItem[]>([]);
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
              "id, case_no, customer_name, customer_phone, site_address, delivery_address, desired_delivery_date, memo, construction_detail"
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

  // 税抜小計: 表示行合計（パッケージ金額行を正とする）→ なければ orders.order_amount
  const displayLines = buildOrderDisplayLines(items);
  const displaySubtotal = displayLines.reduce(
    (sum, line) => sum + line.amount,
    0
  );
  const subtotalExTax =
    displayLines.length > 0
      ? displaySubtotal
      : toNumber(order.order_amount);
  const taxDisplay = buildOrderPrintTaxDisplay(subtotalExTax);

  const deliveryAddress =
    (caseRow?.delivery_address || "").trim() ||
    (caseRow?.site_address || "").trim() ||
    "";

  const caseExtras = parseCaseExtras({
    memo: caseRow?.memo,
    constructionDetail: caseRow?.construction_detail,
  });

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
            <h1 className="order-print-title">発注書</h1>
            <dl className="order-print-meta">
              <div className="order-print-meta-item">
                <dt>発注番号</dt>
                <dd>{displayText(order.order_no)}</dd>
              </div>
              <div className="order-print-meta-item">
                <dt>発注日</dt>
                <dd>{formatDate(order.order_date)}</dd>
              </div>
              <div className="order-print-meta-item">
                <dt>納品希望日</dt>
                <dd>
                  {caseRow?.desired_delivery_date
                    ? formatDate(caseRow.desired_delivery_date)
                    : "—"}
                </dd>
              </div>
              <div className="order-print-meta-item">
                <dt>発注ステータス</dt>
                <dd>{displayText(order.status)}</dd>
              </div>
            </dl>
          </div>
          <div className="order-print-header-rule" aria-hidden="true" />
        </header>

        <section className="order-print-top">
          <div className="order-print-top-left">
            <p className="order-print-supplier">
              {supplierNameOf(order)}
              <span className="order-print-supplier-honorific"> 御中</span>
            </p>
            <div className="order-print-fields">
              <FieldRow label="案件番号" value={caseRow?.case_no} />
              <FieldRow label="顧客名" value={caseRow?.customer_name} />
              <FieldRow
                label="お客様電話番号"
                value={caseRow?.customer_phone}
              />
              <FieldRow label="現場住所" value={caseRow?.site_address} />
              <FieldRow
                label="施工店名"
                value={caseExtras.contractorName}
              />
            </div>
          </div>

          <div className="order-print-top-right">
            <h2 className="order-print-section-title">納品先情報</h2>
            <div className="order-print-fields">
              <FieldRow
                label="納品先住所"
                value={deliveryAddress || null}
              />
              <FieldRow
                label="納品先電話番号"
                value={caseExtras.receiverPhone}
              />
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
                <th className="order-print-num">単価（税抜）</th>
                <th className="order-print-num">金額（税抜）</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {displayLines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="order-print-empty">
                    明細なし
                  </td>
                </tr>
              ) : (
                displayLines.map((line) => (
                  <OrderPrintDisplayRows key={line.key} line={line} />
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="order-print-total-wrap">
          <div className="order-print-total">
            <div className="order-print-total-rule" aria-hidden="true" />
            <div className="order-print-total-rows">
              <div className="order-print-total-row">
                <span className="order-print-total-label">
                  発注小計（税抜）
                </span>
                <span className="order-print-total-value tabular-nums">
                  {formatYen(taxDisplay.subtotalExTax)}
                </span>
              </div>
              <div className="order-print-total-row">
                <span className="order-print-total-label">消費税（10%）</span>
                <span className="order-print-total-value tabular-nums">
                  {formatYen(taxDisplay.taxAmount)}
                </span>
              </div>
              <div className="order-print-total-row order-print-total-row-emphasis">
                <span className="order-print-total-label-emphasis">
                  発注合計（税込）
                </span>
                <span className="order-print-total-amount tabular-nums">
                  {formatYen(taxDisplay.totalInTax)}
                </span>
              </div>
            </div>
            <div className="order-print-total-rule" aria-hidden="true" />
          </div>
        </section>

        <section className="order-print-notes">
          <p className="order-print-notes-heading">【備考】</p>
          <div className="order-print-notes-body whitespace-pre-wrap">
            {order.memo?.trim() ? order.memo : "—"}
          </div>
        </section>

        <PrintCompanyFooter
          company={company}
          attribution="本発注書は ValueOS より出力されました"
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

        .order-print-supplier {
          margin: 0 0 20px;
          font-size: 13pt;
          font-weight: 600;
          color: #111827;
        }

        .order-print-supplier-honorific {
          font-weight: 500;
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

        .order-print-table tbody td.order-print-memo {
          color: #374151;
        }

        .order-print-comp-label {
          color: #6b7280;
          font-size: 9pt;
        }

        .order-print-comp-row td {
          color: #4b5563;
          font-size: 9.5pt;
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

        .order-print-total-wrap {
          margin-top: 28px;
          display: flex;
          justify-content: flex-end;
        }

        .order-print-total {
          min-width: 280px;
          text-align: right;
        }

        .order-print-total-rule {
          border-top: 1px solid #9ca3af;
        }

        .order-print-total-rows {
          margin: 14px 0;
          display: grid;
          gap: 8px;
        }

        .order-print-total-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          align-items: baseline;
        }

        .order-print-total-label {
          font-size: 10pt;
          font-weight: 500;
          color: #4b5563;
          text-align: left;
        }

        .order-print-total-value {
          font-size: 11pt;
          font-weight: 600;
          color: #111827;
        }

        .order-print-total-row-emphasis {
          margin-top: 4px;
          padding-top: 8px;
          border-top: 1px solid #d1d5db;
        }

        .order-print-total-label-emphasis {
          font-size: 11pt;
          font-weight: 700;
          color: #111827;
          text-align: left;
        }

        .order-print-total-amount {
          margin: 0;
          font-size: 20pt;
          font-weight: 700;
          color: #111827;
          letter-spacing: 0.02em;
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

function OrderPrintDisplayRows({ line }: { line: OrderDisplayLine }) {
  if (line.kind === "PACKAGE") {
    return (
      <>
        <tr className="order-print-row">
          <td>—</td>
          <td>—</td>
          <td>{displayText(line.package_name)}</td>
          <td className="order-print-num tabular-nums">{line.quantity}</td>
          <td className="order-print-num tabular-nums">
            {formatYen(line.unit_price)}
          </td>
          <td className="order-print-num tabular-nums">
            {formatYen(line.amount)}
          </td>
          <td className="order-print-memo">パッケージ</td>
        </tr>
        {line.components.map((c) => (
          <tr key={c.key} className="order-print-row order-print-comp-row">
            <td>{displayIdentityValue(c.manufacturer_name)}</td>
            <td>{displayIdentityValue(c.model_no)}</td>
            <td>
              <span className="order-print-comp-label">構成：</span>
              {displayText(c.product_name)}
            </td>
            <td className="order-print-num tabular-nums">{c.quantity}</td>
            <td className="order-print-num tabular-nums">—</td>
            <td className="order-print-num tabular-nums">—</td>
            <td className="order-print-memo">構成内訳</td>
          </tr>
        ))}
      </>
    );
  }

  return (
    <tr className="order-print-row">
      <td>{displayIdentityValue(line.manufacturer_name)}</td>
      <td>{displayIdentityValue(line.model_no)}</td>
      <td>{displayText(line.product_name)}</td>
      <td className="order-print-num tabular-nums">{line.quantity}</td>
      <td className="order-print-num tabular-nums">
        {formatYen(line.unit_price)}
      </td>
      <td className="order-print-num tabular-nums">{formatYen(line.amount)}</td>
      <td className="order-print-memo whitespace-pre-wrap">
        {displayText(line.memo)}
      </td>
    </tr>
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
