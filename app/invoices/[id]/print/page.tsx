import Link from "next/link";

import { formatDate, formatYen } from "@/app/orders/orderUtils";

import { supabase } from "@/lib/supabase";

import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

type Dealer = {
  name: string | null;
  contact_name: string | null;
  address: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  dealers: Dealer | Dealer[] | null;
};

type Invoice = {
  id: string;
  case_id: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: number | string | null;
  memo: string | null;
  cases: CaseData | CaseData[] | null;
};

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
        id,
        case_id,
        invoice_no,
        invoice_date,
        due_date,
        invoice_amount,
        memo,
        cases (
          id,
          case_no,
          customer_name,
          dealers (
            name,
            contact_name,
            address
          )
        )
      `
    )
    .eq("id", id)
    .single();

  if (invoiceError || !invoiceData) {
    return (
      <main className="p-8">
        <div className="rounded-lg bg-red-50 p-6 text-red-700">
          請求情報取得エラー：
          {invoiceError?.message || "請求情報が見つかりません"}
        </div>
      </main>
    );
  }

  const invoice = invoiceData as unknown as Invoice;
  const caseData = getSingleRelation(invoice.cases);
  const dealer = getSingleRelation(caseData?.dealers);

  const invoiceAmount = toNumber(invoice.invoice_amount);

  /*
   * 請求金額を税込総額として扱い、
   * 10%対象の税抜・消費税を逆算表示する（既存ロジック）。
   */
  const subtotal = Math.floor(invoiceAmount / 1.1);
  const taxAmount = invoiceAmount - subtotal;

  const invoiceMemo = (invoice.memo || "").trim();

  /*
   * 請求時点の明細スナップショットはないため、
   * 商品マスタから明細を再構成せず、案件単位の1行を表示する。
   */
  const lineSummary = "案件請求";

  return (
    <>
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-4 px-4 py-5 print:hidden">
        <Link
          href={`/invoices/${invoice.id}`}
          className="rounded-lg border bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ← 請求詳細へ戻る
        </Link>

        <PrintButton />
      </div>

      <main className="order-print-page mx-auto bg-white text-gray-900">
        <header className="order-print-header">
          <div className="order-print-header-row">
            <h1 className="order-print-title">請求書</h1>
            <dl className="order-print-meta">
              <div className="order-print-meta-item">
                <dt>請求番号</dt>
                <dd>{displayText(invoice.invoice_no)}</dd>
              </div>
              <div className="order-print-meta-item">
                <dt>請求日</dt>
                <dd>{formatDate(invoice.invoice_date)}</dd>
              </div>
              <div className="order-print-meta-item">
                <dt>支払期限</dt>
                <dd>{formatDate(invoice.due_date)}</dd>
              </div>
            </dl>
          </div>
          <div className="order-print-header-rule" aria-hidden="true" />
        </header>

        <section className="order-print-top">
          <div className="order-print-top-left">
            <h2 className="order-print-section-title">請求先</h2>
            <p className="order-print-supplier">
              {displayText(dealer?.name)}
              <span className="order-print-supplier-honorific"> 御中</span>
            </p>
            <div className="order-print-fields">
              {dealer?.address?.trim() ? (
                <FieldRow label="住所" value={dealer.address} />
              ) : null}
              {dealer?.contact_name?.trim() ? (
                <FieldRow label="担当者" value={dealer.contact_name} />
              ) : null}
            </div>
          </div>

          <div className="order-print-top-right">
            <h2 className="order-print-section-title">発行元</h2>
            <p className="order-print-issuer-name">株式会社Value Ecology</p>
          </div>
        </section>

        <section className="order-print-amount-summary">
          <div className="order-print-amount-grid">
            <AmountRow label="今回請求額（税抜）" value={formatYen(subtotal)} />
            <AmountRow label="消費税" value={formatYen(taxAmount)} />
            <AmountRow
              label="ご請求金額（税込）"
              value={formatYen(invoiceAmount)}
              emphasis
            />
          </div>
        </section>

        <section className="order-print-lines">
          <table className="order-print-table w-full border-collapse">
            <thead>
              <tr>
                <th>請求日</th>
                <th>案件番号</th>
                <th>顧客名</th>
                <th>摘要</th>
                <th className="order-print-num">金額</th>
              </tr>
            </thead>
            <tbody>
              <tr className="order-print-row">
                <td>{formatDate(invoice.invoice_date)}</td>
                <td>{displayText(caseData?.case_no)}</td>
                <td>{displayText(caseData?.customer_name)}</td>
                <td>{lineSummary}</td>
                <td className="order-print-num tabular-nums">
                  {formatYen(invoiceAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {invoiceMemo ? (
          <section className="order-print-notes">
            <p className="order-print-notes-heading">【備考】</p>
            <div className="order-print-notes-body whitespace-pre-wrap">
              {invoiceMemo}
            </div>
          </section>
        ) : null}

        <footer className="order-print-footer">
          <p className="order-print-footer-company">株式会社Value Ecology</p>
          <p className="order-print-footer-note">
            本請求書は ValueOS より出力されました
          </p>
        </footer>
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

        .order-print-supplier {
          margin: 0 0 20px;
          font-size: 13pt;
          font-weight: 600;
          color: #111827;
        }

        .order-print-supplier-honorific {
          font-weight: 500;
        }

        .order-print-issuer-name {
          margin: 0;
          font-size: 12pt;
          font-weight: 700;
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

        .order-print-amount-summary {
          margin-top: 28px;
        }

        .order-print-amount-grid {
          display: grid;
          gap: 10px;
          max-width: 360px;
          margin-left: auto;
        }

        .order-print-amount-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          align-items: baseline;
          padding-bottom: 10px;
          border-bottom: 1px solid #e5e7eb;
        }

        .order-print-amount-row-emphasis {
          border-bottom: none;
          padding-top: 6px;
        }

        .order-print-amount-label {
          font-size: 10pt;
          color: #374151;
        }

        .order-print-amount-label-emphasis {
          font-size: 11pt;
          font-weight: 700;
          color: #111827;
        }

        .order-print-amount-value {
          font-size: 11pt;
          font-weight: 600;
          color: #111827;
          text-align: right;
          white-space: nowrap;
        }

        .order-print-amount-value-emphasis {
          font-size: 18pt;
          font-weight: 700;
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

function displayText(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  return trimmed || "—";
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

function AmountRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`order-print-amount-row${
        emphasis ? " order-print-amount-row-emphasis" : ""
      }`}
    >
      <span
        className={
          emphasis
            ? "order-print-amount-label-emphasis"
            : "order-print-amount-label"
        }
      >
        {label}
      </span>
      <span
        className={`order-print-amount-value tabular-nums${
          emphasis ? " order-print-amount-value-emphasis" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}
