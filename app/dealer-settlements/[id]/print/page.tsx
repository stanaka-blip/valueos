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

  let dealerName = "";
  {
    const { data: dealers } = await (admin as SupabaseClient)
      .from("dealers")
      .select("id, name")
      .eq("id", settlement.dealer_id)
      .maybeSingle();
    dealerName = String(dealers?.name || "");
  }

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

  return (
    <>
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-4 px-4 py-5 print:hidden">
        <Link
          href={`/cases/${caseId}?tab=settlement`}
          className="rounded-lg border bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ← 案件へ戻る
        </Link>
        <PrintButton />
      </div>

      <main className="order-print-page mx-auto bg-white text-gray-900">
        <header className="order-print-header">
          <div className="order-print-header-row">
            <h1 className="order-print-title">仕切清算書</h1>
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
            <h2 className="order-print-section-title">販売店</h2>
            <p className="order-print-supplier">
              {displayText(dealerName)}
              <span className="order-print-supplier-honorific"> 御中</span>
            </p>
            <div className="order-print-fields">
              <div className="order-print-field">
                <span className="order-print-field-label">案件番号</span>
                <span>{displayText(caseRow.case_no)}</span>
              </div>
              <div className="order-print-field">
                <span className="order-print-field-label">顧客名</span>
                <span>{displayText(caseRow.customer_name)}</span>
              </div>
              <div className="order-print-field">
                <span className="order-print-field-label">契約日</span>
                <span>{formatDate(contractDate)}</span>
              </div>
              <div className="order-print-field">
                <span className="order-print-field-label">納品日</span>
                <span>{formatDate(deliveryDate)}</span>
              </div>
              <div className="order-print-field">
                <span className="order-print-field-label">信販会社</span>
                <span>{displayText(financeCompanyName)}</span>
              </div>
            </div>
          </div>
          <InvoiceIssuerBlock company={company} />
        </section>

        <section className="mt-8 overflow-hidden rounded border border-gray-300">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-gray-200">
                <th className="w-[58%] bg-gray-50 px-4 py-3 text-left font-medium text-gray-700">
                  クレジット会社入金額（信販入金）
                </th>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatYen(model.creditReceivedAmount)}
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="bg-gray-50 px-4 py-3 text-left font-medium text-gray-700">
                  弊社売上金額（Value Ecology 請求額）
                </th>
                <td className="px-4 py-3 text-right tabular-nums">
                  − {formatYen(model.veShareAmount)}
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="bg-gray-50 px-4 py-3 text-left font-medium text-gray-700">
                  振込手数料
                </th>
                <td className="px-4 py-3 text-right tabular-nums">
                  {model.transferFeeTotal > 0
                    ? `− ${formatYen(model.transferFeeTotal)}`
                    : "—"}
                </td>
              </tr>
              {model.otherAdjustmentLines.map((line) => (
                <tr key={line.id} className="border-b border-gray-200">
                  <th className="bg-gray-50 px-4 py-3 text-left font-medium text-gray-700">
                    {line.label}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">
                    − {formatYen(line.amount)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-900 text-white">
                <th className="px-4 py-4 text-left text-base font-bold">
                  御振込金額（販売店への最終振込額）
                </th>
                <td className="px-4 py-4 text-right text-lg font-bold tabular-nums">
                  {formatYen(model.payoutAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">支払予定日</p>
            <p className="mt-1 font-medium">
              {formatDate(settlement.scheduled_payout_date)}
            </p>
          </div>
          <div className="rounded border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">実支払日</p>
            <p className="mt-1 font-medium">
              {formatDate(settlement.actual_payout_date)}
            </p>
          </div>
        </section>

        {memo ? (
          <section className="mt-6">
            <h2 className="order-print-section-title">備考</h2>
            <p className="mt-2 whitespace-pre-wrap rounded border border-gray-200 px-4 py-3 text-sm">
              {memo}
            </p>
          </section>
        ) : null}

        <p className="mt-6 text-xs text-gray-500">
          本書は仕切清算書です。請求書とは別書類として発行されます。計算: 御振込金額
          = クレジット会社入金額 − 弊社売上金額 − Σ調整額
        </p>

        <PrintCompanyFooter
          company={company}
          attribution="Value Ecology / ValueOS 仕切清算書"
        />
      </main>
    </>
  );
}
