import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  InvoiceIssuerBlock,
  PrintCompanyFooter,
} from "@/app/components/print/CompanyPrintBlocks";
import { formatDate, formatYen } from "@/app/orders/orderUtils";
import { toCompanySettingsDto } from "@/lib/companyInfo/companySettingsDto";
import { getCompanySettingsAdmin } from "@/lib/companyInfo/getCompanySettingsAdmin";
import type { PrintCompanyInfo } from "@/lib/companyInfo/printCompanyInfo";
import { trimOrNull } from "@/lib/companyInfo/printCompanyInfo";
import { buildDealerSettlementPrintModel } from "@/lib/threeParty/dealerSettlementPrintModel";
import { resolveDealerSettlementDisplayStatus } from "@/lib/threeParty/moneyEventStatus";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function displayText(value: string | null | undefined): string {
  const v = (value || "").trim();
  return v || "—";
}

type DealerRow = {
  name?: string | null;
  contact_name?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_type?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
  [key: string]: unknown;
};

function dealerHasBankInfo(dealer: DealerRow | null): boolean {
  if (!dealer) return false;
  return Boolean(
    trimOrNull(String(dealer.bank_name ?? "")) ||
      trimOrNull(String(dealer.bank_branch ?? "")) ||
      trimOrNull(String(dealer.bank_account_type ?? "")) ||
      trimOrNull(String(dealer.bank_account_number ?? "")) ||
      trimOrNull(String(dealer.bank_account_holder ?? ""))
  );
}

export default async function DealerSettlementPrintPage({ params }: PageProps) {
  const { id } = await params;

  let admin;
  try {
    admin = getServiceRoleSupabase();
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return (
        <main className="p-8">
          <div className="rounded-lg bg-red-50 p-6 text-red-700">
            サーバー設定が完了していません
          </div>
        </main>
      );
    }
    throw e;
  }

  const { data: settlement, error } = await admin
    .from("dealer_settlements")
    .select(
      `
      id,
      case_id,
      dealer_id,
      statement_no,
      issue_date,
      finance_receipt_id,
      invoice_id,
      status,
      credit_received_amount,
      ve_share_amount,
      adjustment_total_amount,
      payout_amount,
      scheduled_payout_date,
      actual_payout_date,
      actual_payout_amount,
      contract_date,
      delivery_date,
      memo,
      dealer_settlement_lines (
        id,
        line_kind,
        description,
        amount,
        sort_order
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !settlement) {
    notFound();
  }

  const caseId = String(settlement.case_id);
  const { data: caseRow } = await admin
    .from("cases")
    .select(
      `
      id,
      case_no,
      customer_name,
      order_received_date,
      desired_delivery_date,
      construction_completed_date
    `
    )
    .eq("id", caseId)
    .maybeSingle();

  if (!caseRow) {
    notFound();
  }

  let dealer: DealerRow | null = null;
  {
    const { data: dealers } = await (admin as SupabaseClient)
      .from("dealers")
      .select("*")
      .eq("id", settlement.dealer_id)
      .maybeSingle();
    dealer = (dealers as DealerRow | null) || null;
  }
  const dealerName = String(dealer?.name || "");

  let financeCompanyName = "";
  if (settlement.finance_receipt_id) {
    const { data: fr } = await admin
      .from("finance_receipts")
      .select("finance_company")
      .eq("id", settlement.finance_receipt_id)
      .maybeSingle();
    financeCompanyName = String(fr?.finance_company || "");
  }

  const companyResult = await getCompanySettingsAdmin(admin);
  if (!companyResult.ok) {
    return (
      <main className="p-8">
        <div className="rounded-lg bg-red-50 p-6 text-red-700">
          会社情報の取得に失敗しました：
          {companyResult.error_message}
          （帳票を空欄のまま出力しません。設定またはサーバー状態を確認してください。）
        </div>
      </main>
    );
  }
  const company: PrintCompanyInfo = toCompanySettingsDto(companyResult.data);

  const lines = (
    (settlement.dealer_settlement_lines ?? []) as Array<{
      id: string;
      line_kind: string;
      description: string;
      amount: number;
      sort_order: number;
    }>
  ).map((l) => ({
    id: l.id,
    line_kind: l.line_kind,
    description: l.description,
    amount: Number(l.amount) || 0,
    sort_order: Number(l.sort_order) || 0,
  }));

  const model = buildDealerSettlementPrintModel({
    credit_received_amount: Number(settlement.credit_received_amount) || 0,
    ve_share_amount: Number(settlement.ve_share_amount) || 0,
    payout_amount: Number(settlement.payout_amount) || 0,
    adjustment_total_amount: Number(settlement.adjustment_total_amount) || 0,
    lines,
  });

  /** 表示のみ。header snapshot の調整合計（計算ロジックは変更しない） */
  const adjustmentDisplay =
    Number(settlement.adjustment_total_amount) ||
    model.transferFeeTotal +
      model.otherAdjustmentLines.reduce((s, l) => s + l.amount, 0);

  const statusLabel = resolveDealerSettlementDisplayStatus({
    status: settlement.status,
    scheduledPayoutDate: settlement.scheduled_payout_date,
  });

  const contractDate =
    settlement.contract_date || caseRow.order_received_date || null;
  const deliveryDate =
    settlement.delivery_date ||
    caseRow.construction_completed_date ||
    caseRow.desired_delivery_date ||
    null;
  const issueDate = settlement.issue_date || new Date().toISOString().slice(0, 10);
  const memo = (settlement.memo || "").trim();
  const showDealerBank = dealerHasBankInfo(dealer);

  return (
    <>
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-4 px-4 py-5 print:hidden">
        <Link
          href={`/cases/${caseId}?tab=invoice`}
          className="rounded-lg border bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ← 案件へ戻る
        </Link>
        <PrintButton />
      </div>

      <main className="order-print-page mx-auto bg-white text-gray-900">
        <header className="order-print-header">
          <div className="order-print-header-row">
            <h1 className="order-print-title">仕切精算書</h1>
            <dl className="order-print-meta">
              <div className="order-print-meta-item">
                <dt>書類番号</dt>
                <dd>{displayText(settlement.statement_no)}</dd>
              </div>
              <div className="order-print-meta-item">
                <dt>発行日</dt>
                <dd>{formatDate(issueDate)}</dd>
              </div>
              <div className="order-print-meta-item">
                <dt>状態</dt>
                <dd>{statusLabel}</dd>
              </div>
            </dl>
          </div>
          <div className="order-print-header-rule" aria-hidden="true" />
        </header>

        <section className="order-print-top">
          <div className="order-print-top-left">
            <h2 className="order-print-section-title">宛先</h2>
            <p className="order-print-supplier">
              {displayText(dealerName)}
              <span className="order-print-supplier-honorific"> 御中</span>
            </p>
            <div className="order-print-fields">
              {trimOrNull(dealer?.address) ? (
                <FieldRow label="住所" value={String(dealer?.address)} />
              ) : null}
              {trimOrNull(dealer?.contact_name) ? (
                <FieldRow label="担当者" value={String(dealer?.contact_name)} />
              ) : null}
            </div>
          </div>

          <InvoiceIssuerBlock company={company} />
        </section>

        <section className="order-print-amount-summary">
          <h2 className="order-print-section-title">精算内訳</h2>
          <div className="order-print-amount-grid">
            <AmountRow
              label="信販入金額"
              value={formatYen(model.creditReceivedAmount)}
            />
            <AmountRow
              label="商品請求額"
              value={`− ${formatYen(model.veShareAmount)}`}
            />
            <AmountRow
              label="調整額/手数料"
              value={`− ${formatYen(adjustmentDisplay)}`}
            />
            <AmountRow
              label="御振込金額"
              value={formatYen(model.payoutAmount)}
              emphasis
            />
          </div>
        </section>

        <section className="order-print-case-meta">
          <h2 className="order-print-section-title">案件情報</h2>
          <div className="order-print-fields">
            <FieldRow label="案件番号" value={caseRow.case_no} />
            <FieldRow label="顧客名" value={caseRow.customer_name} />
            <FieldRow label="契約日" value={formatDate(contractDate)} />
            <FieldRow label="納品日" value={formatDate(deliveryDate)} />
            <FieldRow label="信販会社" value={financeCompanyName} />
            <FieldRow
              label="支払予定日"
              value={formatDate(settlement.scheduled_payout_date)}
            />
            <FieldRow
              label="実支払日"
              value={formatDate(settlement.actual_payout_date)}
            />
          </div>
        </section>

        {showDealerBank ? (
          <section className="order-print-bank">
            <h2 className="order-print-section-title">販売店 お振込先</h2>
            <div className="order-print-fields">
              {trimOrNull(String(dealer?.bank_name ?? "")) ? (
                <FieldRow label="銀行名" value={String(dealer?.bank_name)} />
              ) : null}
              {trimOrNull(String(dealer?.bank_branch ?? "")) ? (
                <FieldRow label="支店名" value={String(dealer?.bank_branch)} />
              ) : null}
              {trimOrNull(String(dealer?.bank_account_type ?? "")) ? (
                <FieldRow
                  label="口座種別"
                  value={String(dealer?.bank_account_type)}
                />
              ) : null}
              {trimOrNull(String(dealer?.bank_account_number ?? "")) ? (
                <FieldRow
                  label="口座番号"
                  value={String(dealer?.bank_account_number)}
                />
              ) : null}
              {trimOrNull(String(dealer?.bank_account_holder ?? "")) ? (
                <FieldRow
                  label="口座名義"
                  value={String(dealer?.bank_account_holder)}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        {memo ? (
          <section className="order-print-notes">
            <p className="order-print-notes-heading">【備考】</p>
            <div className="order-print-notes-body whitespace-pre-wrap">
              {memo}
            </div>
          </section>
        ) : null}

        <p className="order-print-doc-note">
          本書は仕切精算書です。請求書とは別書類として発行されます。
        </p>

        <PrintCompanyFooter
          company={company}
          attribution="本仕切精算書は ValueOS より出力されました"
          showContact={false}
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
          box-sizing: border-box;
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

        .order-print-case-meta {
          margin-top: 24px;
        }

        .order-print-bank {
          margin-top: 28px;
        }

        .order-print-notes {
          margin-top: 28px;
        }

        .order-print-notes-heading {
          margin: 0 0 10px;
          font-size: 10pt;
          font-weight: 600;
          color: #374151;
        }

        .order-print-notes-body {
          min-height: 48px;
          padding: 14px 16px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background: #fafafa;
          font-size: 10pt;
          color: #111827;
        }

        .order-print-doc-note {
          margin: 20px 0 0;
          font-size: 8.5pt;
          color: #6b7280;
        }

        .order-print-footer {
          margin-top: 28px;
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
