"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";

import StatusSelect from "../StatusSelect";
import TaskStatusSelect from "../../tasks/TaskStatusSelect";
import type { WorkflowResult } from "@/lib/workflow";

import type { ThreePartyMoneyView } from "@/lib/threeParty/loadThreePartyMoneyAdmin";
import {
  computeThreePartyRecoveryAmounts,
  sumDealerPaidAmount,
} from "@/lib/threeParty/threePartyRecovery";
import { sumActiveInvoiceAmounts } from "@/lib/threeParty/dealerSettlementCalc";
import {
  computeConfirmedCaseProfit,
  computeForecastCaseProfit,
} from "@/lib/profit/caseProfitCalc";

import SettlementForm from "./SettlementForm";
import ThreePartyMoneyPanels from "./ThreePartyMoneyPanels";
import WorkflowPanel from "./WorkflowPanel";
import type { SettlementViewData } from "./settlementView";
import CaseDocumentsPanel from "@/app/components/case-attachments/CaseDocumentsPanel";
import {
  CASE_DETAIL_TABS,
  resolveCaseDetailTabId,
  type CaseDetailTabId,
} from "./caseDetailTabs";
import {
  formatNullableYen,
  formatProfitRate,
  sumNullableAmounts,
  type CaseProductDisplayRow,
} from "./productDisplay";

export type { CaseDetailTabId };
export { resolveCaseDetailTabId };

const TABS = CASE_DETAIL_TABS;

export type CaseDetailViewData = {
  id: string;
  caseNo: string;
  status: string | null;
  createdAt: string | null;
  orderReceivedDate: string | null;
  dealerName: string;
  dealerContact: string;
  customerName: string;
  customerPhone: string;
  siteAddress: string;
  deliveryAddress: string;
  desiredDeliveryDate: string | null;
  constructionDate: string | null;
  constructionCompletedDate: string | null;
  constructionDetail: string;
  orderType: string;
  assignedUser: string;
  department: string;
  priority: string;
  memo: string;
  productName: string;
  quantity: string;
};

export type CaseProductRow = CaseProductDisplayRow;

export type OrderLineRow = {
  id: string;
  manufacturerName: string;
  modelNo: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** パッケージ行の構成内訳（金額なし） */
  components?: Array<{
    id: string;
    manufacturerName: string;
    modelNo: string;
    quantity: number;
  }>;
};

export type OrderRow = {
  id: string;
  orderNo: string;
  supplierId: string | null;
  supplierName: string;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  orderAmount: number;
  status: string;
  memo: string;
  /** 仕入金額表示用（パッケージは1行＋構成内訳） */
  lines: OrderLineRow[];
  /** 納品数量表示用（パッケージ金額行を除く構成数量） */
  deliveryLines: OrderLineRow[];
};

export type InvoiceRow = {
  id: string;
  invoiceNo: string;
  invoiceDate: string | null;
  dueDate: string | null;
  invoiceAmount: number;
  status: string;
  memo: string;
};

export type PaymentRow = {
  id: string;
  invoiceId: string | null;
  paymentDate: string | null;
  paymentAmount: number;
  status: string;
  memo: string;
};

export type TaskRow = {
  id: string;
  title: string;
  dueDate: string | null;
  assignedUser: string;
  status: string | null;
};

type CaseDetailViewProps = {
  caseData: CaseDetailViewData;
  products: CaseProductRow[];
  orders: OrderRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  tasks: TaskRow[];
  settlement: SettlementViewData | null;
  workflow: WorkflowResult;
  dealerPaymentType?: string;
  dealerId?: string | null;
  threePartyMoney?: ThreePartyMoneyView;
  /** URL ?tab= などからの初期タブ（未指定時は基本情報） */
  initialTab?: CaseDetailTabId;
  errors: {
    products?: string;
    orders?: string;
    invoices?: string;
    payments?: string;
    tasks?: string;
    settlement?: string;
  };
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.round(value)) + "円";
}

function display(value: string | null | undefined): string {
  const v = (value || "").trim();
  return v || "—";
}

const EMPTY_THREE_PARTY: ThreePartyMoneyView = {
  financeReceipts: [],
  dealerSettlements: [],
  supplierPayments: [],
};

export default function CaseDetailView({
  caseData,
  products,
  orders,
  invoices,
  payments,
  tasks,
  settlement,
  workflow,
  dealerPaymentType,
  dealerId = null,
  threePartyMoney = EMPTY_THREE_PARTY,
  initialTab = "basic",
  errors,
}: CaseDetailViewProps) {
  const [tab, setTab] = useState<CaseDetailTabId>(initialTab);
  const [viewMode, setViewMode] = useState<"detail" | "simple">("detail");

  const totals = useMemo(() => {
    const sales = sumNullableAmounts(products.map((p) => p.salesPrice));
    const purchase = sumNullableAmounts(products.map((p) => p.purchasePrice));
    const profit = sumNullableAmounts(products.map((p) => p.grossProfit));
    const orderAmount = orders
      .filter((o) => o.status !== "キャンセル")
      .reduce((s, o) => s + o.orderAmount, 0);
    const invoiceAmount = invoices
      .filter((i) => i.status !== "取消")
      .reduce((s, i) => s + i.invoiceAmount, 0);
    const paidIn = payments
      .filter((p) => p.status !== "取消")
      .reduce((s, p) => s + p.paymentAmount, 0);
    const rate = sales > 0 ? (profit / sales) * 100 : null;

    return {
      sales,
      purchase,
      profit,
      rate,
      orderAmount,
      invoiceAmount,
      paidIn,
      unpaid: Math.max(invoiceAmount - paidIn, 0),
    };
  }, [products, orders, invoices, payments]);

  const deliverySummary = useMemo(
    () => summarizeDeliveries(orders),
    [orders]
  );
  const paymentSummary = useMemo(() => summarizePayments(orders), [orders]);

  return (
    <div className="min-h-full bg-[#f7f7f5] text-gray-900">
      <div className="border-b border-gray-200/80 bg-white">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/cases"
            className="text-sm text-gray-500 transition hover:text-gray-900"
          >
            ← 案件一覧
          </Link>
          <div className="flex items-center gap-2">
            <div className="mr-2 hidden items-center rounded-lg border border-gray-200 p-0.5 sm:flex">
              <button
                type="button"
                onClick={() => setViewMode("detail")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewMode === "detail"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                詳細
              </button>
              <button
                type="button"
                onClick={() => setViewMode("simple")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewMode === "simple"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                簡易表示
              </button>
            </div>
            <Link
              href={`/cases/${caseData.id}/products/new`}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              商品追加
            </Link>
            {workflow.canOrder ||
            (workflow.ruleKey === null &&
              workflow.warnings.includes("決済区分が未設定です")) ? (
              <Link
                href={`/cases/${caseData.id}/orders/new`}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                仕入発注
              </Link>
            ) : (
              <span
                title={workflow.warnings.join(" / ") || "発注不可"}
                className="cursor-not-allowed rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-400"
              >
                仕入発注（不可）
              </span>
            )}
            {workflow.canInvoice ? (
              <Link
                href={`/cases/${caseData.id}/invoices/new`}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                請求登録
              </Link>
            ) : (
              <span
                title={workflow.warnings.join(" / ") || "請求不可"}
                className="cursor-not-allowed rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500"
              >
                請求登録（不可）
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pt-4 lg:px-6">
        <WorkflowPanel
          caseId={caseData.id}
          workflow={workflow}
          settlement={settlement}
          constructionCompletedDate={caseData.constructionCompletedDate}
          payments={payments}
          orders={orders}
        />
      </div>

      <div className="mx-auto flex max-w-[1400px]">
        {/* Left: case info */}
        <aside className="sticky top-0 hidden h-[calc(100vh-49px)] w-[300px] shrink-0 overflow-y-auto border-r border-gray-200/80 bg-white lg:block">
          <div className="space-y-6 p-6">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                Case
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
                {display(caseData.caseNo)}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {display(caseData.customerName)}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-gray-400">
                ステータス
              </p>
              <StatusSelect
                caseId={caseData.id}
                currentStatus={caseData.status}
              />
            </div>

            <Divider />

            <MetaBlock title="販売店">
              <MetaRow label="販売店" value={caseData.dealerName} />
              <MetaRow label="社内担当" value={caseData.assignedUser} />
            </MetaBlock>

            <MetaBlock title="業務担当（Workflow）">
              <MetaRow label="担当" value={workflow.assignee} />
              <MetaRow label="次のアクション" value={workflow.nextAction} />
              <MetaRow label="状態" value={workflow.currentState} />
            </MetaBlock>

            <MetaBlock title="顧客">
              <MetaRow label="顧客名" value={caseData.customerName} />
              <MetaRow label="電話" value={caseData.customerPhone} />
            </MetaBlock>

            <MetaBlock title="納品">
              <MetaRow
                label="希望日"
                value={formatDate(caseData.desiredDeliveryDate)}
              />
              <MetaRow label="住所" value={caseData.deliveryAddress} />
              <MetaRow
                label="進捗"
                value={`済 ${deliverySummary.delivered} / 遅延 ${deliverySummary.overdue}`}
              />
            </MetaBlock>

            <Divider />

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="売上" value={formatYen(totals.sales)} />
              <MiniStat label="粗利" value={formatYen(totals.profit)} />
              <MiniStat
                label="未入金"
                value={formatYen(totals.unpaid)}
                alert={totals.unpaid > 0}
              />
              <MiniStat
                label="支払目安"
                value={formatYen(paymentSummary.targetAmount)}
              />
            </div>

            <p className="text-xs text-gray-400">
              登録 {formatDateTime(caseData.createdAt)}
            </p>
          </div>
        </aside>

        {/* Right: tabs / simple */}
        <main className="min-w-0 flex-1">
          {/* Mobile case summary */}
          <div className="border-b border-gray-200/80 bg-white px-6 py-4 lg:hidden">
            <h1 className="text-lg font-semibold">{display(caseData.caseNo)}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {display(caseData.customerName)} / {display(caseData.dealerName)}
            </p>
            <div className="mt-3">
              <StatusSelect
                caseId={caseData.id}
                currentStatus={caseData.status}
              />
            </div>
            <div className="mt-3 flex items-center rounded-lg border border-gray-200 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("detail")}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                  viewMode === "detail"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600"
                }`}
              >
                詳細
              </button>
              <button
                type="button"
                onClick={() => setViewMode("simple")}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                  viewMode === "simple"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600"
                }`}
              >
                簡易表示
              </button>
            </div>
          </div>

          {viewMode === "detail" ? (
            <div className="sticky top-0 z-10 border-b border-gray-200/80 bg-[#f7f7f5]/80 backdrop-blur">
              <nav className="flex gap-0 overflow-x-auto px-4 md:px-6">
                {TABS.map((item) => {
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`relative shrink-0 px-3 py-3 text-sm transition ${
                        active
                          ? "font-medium text-gray-900"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {item.label}
                      {active ? (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gray-900" />
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </div>
          ) : null}

          <div className="p-6 md:p-8">
            {viewMode === "simple" ? (
              <SimpleOverview
                caseData={caseData}
                products={products}
                orders={orders}
                invoices={invoices}
                payments={payments}
                settlement={settlement}
                totals={totals}
                deliverySummary={deliverySummary}
                paymentSummary={paymentSummary}
                onOpenTab={(next) => {
                  setTab(next);
                  setViewMode("detail");
                }}
              />
            ) : null}
            {viewMode === "detail" && tab === "basic" ? (
              <BasicTab caseData={caseData} tasks={tasks} tasksError={errors.tasks} />
            ) : null}
            {viewMode === "detail" && tab === "products" ? (
              <ProductsTab
                caseId={caseData.id}
                products={products}
                error={errors.products}
              />
            ) : null}
            {viewMode === "detail" && tab === "settlement" ? (
              <SettlementTab
                caseId={caseData.id}
                settlement={settlement}
                loadError={errors.settlement}
                dealerPaymentType={dealerPaymentType}
                dealerId={dealerId}
                invoices={invoices}
                orders={orders}
                threePartyMoney={threePartyMoney}
              />
            ) : null}
            {viewMode === "detail" && tab === "purchase" ? (
              <PurchaseTab
                caseId={caseData.id}
                orders={orders}
                error={errors.orders}
              />
            ) : null}
            {viewMode === "detail" && tab === "delivery" ? (
              <DeliveryTab orders={orders} caseData={caseData} />
            ) : null}
            {viewMode === "detail" && tab === "invoice" ? (
              <InvoiceReceiptTab
                caseId={caseData.id}
                invoices={invoices}
                payments={payments}
                totals={totals}
                invoiceError={errors.invoices}
                paymentError={errors.payments}
                settlementType={settlement?.settlementType || ""}
                dealerId={dealerId}
                orders={orders}
                threePartyMoney={threePartyMoney}
                financeCompanyDefault={settlement?.financeCompany || ""}
              />
            ) : null}
            {viewMode === "detail" && tab === "payment" ? (
              <PaymentTab
                caseId={caseData.id}
                orders={orders}
                dealerId={dealerId}
                invoices={invoices}
                threePartyMoney={threePartyMoney}
                financeCompanyDefault={settlement?.financeCompany || ""}
                settlementType={settlement?.settlementType || ""}
              />
            ) : null}
            {viewMode === "detail" && tab === "profit" ? (
              <ProfitTab
                products={products}
                invoices={invoices}
                orders={orders}
                totals={totals}
                settlement={settlement}
              />
            ) : null}
            {viewMode === "detail" && tab === "documents" ? (
              <CaseDocumentsPanel caseId={caseData.id} />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

type DeliveryStatusLabel = "納品済" | "納品予定" | "遅延" | "未納品" | "対象外";

function getDeliveryStatus(order: OrderRow): DeliveryStatusLabel {
  if (order.status === "キャンセル" || order.status === "取消") {
    return "対象外";
  }
  if (order.deliveredDate || order.status === "納品済") {
    return "納品済";
  }
  const today = getTodayString();
  if (
    order.expectedDeliveryDate &&
    order.expectedDeliveryDate < today &&
    order.status !== "一部納品"
  ) {
    return "遅延";
  }
  if (
    order.expectedDeliveryDate ||
    order.status === "納期確定" ||
    order.status === "一部納品" ||
    order.status === "納期回答待ち"
  ) {
    return "納品予定";
  }
  return "未納品";
}

function summarizeDeliveries(orders: OrderRow[]) {
  const active = orders.filter(
    (order) => order.status !== "キャンセル" && order.status !== "取消"
  );
  let delivered = 0;
  let scheduled = 0;
  let overdue = 0;
  let pending = 0;

  for (const order of active) {
    const status = getDeliveryStatus(order);
    if (status === "納品済") delivered += 1;
    else if (status === "遅延") overdue += 1;
    else if (status === "納品予定") scheduled += 1;
    else pending += 1;
  }

  return {
    total: active.length,
    delivered,
    scheduled,
    overdue,
    pending,
  };
}

function summarizePayments(orders: OrderRow[]) {
  const active = orders.filter(
    (order) => order.status !== "キャンセル" && order.status !== "取消"
  );
  let targetAmount = 0;
  let readyAmount = 0;
  let pendingAmount = 0;

  for (const order of active) {
    targetAmount += order.orderAmount;
    if (getDeliveryStatus(order) === "納品済") {
      readyAmount += order.orderAmount;
    } else {
      pendingAmount += order.orderAmount;
    }
  }

  return { targetAmount, readyAmount, pendingAmount };
}

function SimpleOverview({
  caseData,
  products,
  orders,
  invoices,
  payments,
  settlement,
  totals,
  deliverySummary,
  paymentSummary,
  onOpenTab,
}: {
  caseData: CaseDetailViewData;
  products: CaseProductRow[];
  orders: OrderRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  settlement: SettlementViewData | null;
  totals: {
    sales: number;
    purchase: number;
    profit: number;
    rate: number | null;
    orderAmount: number;
    invoiceAmount: number;
    paidIn: number;
    unpaid: number;
  };
  deliverySummary: ReturnType<typeof summarizeDeliveries>;
  paymentSummary: ReturnType<typeof summarizePayments>;
  onOpenTab: (tab: CaseDetailTabId) => void;
}) {
  return (
    <div className="space-y-6">
      <Section
        title="簡易表示"
        description="案件の要点を1画面で確認"
        action={
          <button
            type="button"
            onClick={() => onOpenTab("basic")}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            詳細タブへ
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="案件番号" value={caseData.caseNo} />
          <Field label="販売店" value={caseData.dealerName} />
          <Field label="顧客名" value={caseData.customerName} />
          <Field
            label="希望納品日"
            value={formatDate(caseData.desiredDeliveryDate)}
          />
          <Field label="決済区分" value={settlement?.settlementType || ""} />
          <Field label="商品数" value={`${products.length}件`} />
          <Field label="発注数" value={`${orders.length}件`} />
          <Field label="請求数" value={`${invoices.length}件`} />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="納品"
          description={`済 ${deliverySummary.delivered} / 遅延 ${deliverySummary.overdue}`}
          action={
            <button
              type="button"
              onClick={() => onOpenTab("delivery")}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              詳細
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="対象" value={`${deliverySummary.total}件`} />
            <MiniStat label="予定" value={`${deliverySummary.scheduled}件`} />
            <MiniStat label="済" value={`${deliverySummary.delivered}件`} />
            <MiniStat
              label="遅延"
              value={`${deliverySummary.overdue}件`}
              alert={deliverySummary.overdue > 0}
            />
          </div>
        </Section>

        <Section
          title="支払"
          description="発注ベースの支払目安"
          action={
            <button
              type="button"
              onClick={() => onOpenTab("payment")}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              詳細
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-3">
            <MiniStat
              label="支払対象合計"
              value={formatYen(paymentSummary.targetAmount)}
            />
            <MiniStat
              label="支払準備OK"
              value={formatYen(paymentSummary.readyAmount)}
            />
            <MiniStat
              label="支払待ち"
              value={formatYen(paymentSummary.pendingAmount)}
            />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="請求・入金"
          action={
            <button
              type="button"
              onClick={() => onOpenTab("invoice")}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              詳細
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="請求" value={formatYen(totals.invoiceAmount)} />
            <MiniStat label="入金" value={formatYen(totals.paidIn)} />
            <MiniStat
              label="未入金"
              value={formatYen(totals.unpaid)}
              alert={totals.unpaid > 0}
            />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            入金実績 {payments.length}件
          </p>
        </Section>

        <Section
          title="粗利"
          action={
            <button
              type="button"
              onClick={() => onOpenTab("profit")}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              詳細
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="売上" value={formatYen(totals.sales)} />
            <MiniStat label="仕入" value={formatYen(totals.purchase)} />
            <MiniStat label="粗利" value={formatYen(totals.profit)} />
            <MiniStat
              label="粗利率"
              value={
                totals.rate == null ? "—" : `${totals.rate.toFixed(1)}%`
              }
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

function BasicTab({
  caseData,
  tasks,
  tasksError,
}: {
  caseData: CaseDetailViewData;
  tasks: TaskRow[];
  tasksError?: string;
}) {
  return (
    <div className="space-y-6">
      <Section
        title="基本情報"
        description="案件の身元と納期"
        action={
          <Link
            href={`/cases/${caseData.id}/edit`}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            編集
          </Link>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="案件番号" value={caseData.caseNo} />
          <Field
            label="受注日"
            value={formatDate(caseData.orderReceivedDate)}
          />
          <Field label="登録日" value={formatDateTime(caseData.createdAt)} />
          <Field label="販売店" value={caseData.dealerName} />
          <Field label="販売店担当者" value={caseData.dealerContact} />
          <Field label="顧客名" value={caseData.customerName} />
          <Field label="電話番号" value={caseData.customerPhone} />
          <Field label="施工先住所" value={caseData.siteAddress} />
          <Field label="発注区分" value={caseData.orderType} />
          <Field
            label="希望納期"
            value={formatDate(caseData.desiredDeliveryDate)}
          />
          <Field label="配送先" value={caseData.deliveryAddress} />
          <Field label="社内担当" value={caseData.assignedUser} />
          <Field label="部署" value={caseData.department} />
          <Field label="優先度" value={caseData.priority} />
        </div>
      </Section>

      <Section title="工事情報" description="工事希望と内容">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="工事希望日"
            value={formatDate(caseData.constructionDate)}
          />
          <div className="sm:col-span-2">
            <Field
              label="工事内容"
              value={caseData.constructionDetail}
              multiline
            />
          </div>
        </div>
      </Section>

      <Section title="備考">
        <p className="whitespace-pre-wrap text-sm text-gray-700">
          {caseData.memo.trim() ? caseData.memo : "備考はありません。"}
        </p>
      </Section>

      <Section
        title="タスク"
        description="この案件の社内タスク"
        action={
          <Link
            href={`/tasks/new?case_id=${caseData.id}`}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ＋ タスク追加
          </Link>
        }
      >
        {tasksError ? <ErrorText text={tasksError} /> : null}
        {!tasksError && tasks.length === 0 ? (
          <Empty text="この案件に紐づくタスクはまだありません。" />
        ) : null}
        {!tasksError && tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {display(task.title)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    期限：{formatDate(task.dueDate)} / 担当：
                    {display(task.assignedUser)}
                  </p>
                </div>
                <TaskStatusSelect
                  taskId={task.id}
                  currentStatus={task.status}
                />
              </div>
            ))}
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function ProductsTab({
  caseId,
  products,
  error,
}: {
  caseId: string;
  products: CaseProductRow[];
  error?: string;
}) {
  const salesTotal = sumNullableAmounts(products.map((row) => row.salesPrice));
  const purchaseTotal = sumNullableAmounts(
    products.map((row) => row.purchasePrice)
  );
  const profitTotal = sumNullableAmounts(products.map((row) => row.grossProfit));

  return (
    <Section
      title="商品"
      description={
        products.length > 0
          ? `売上 ${formatYen(salesTotal)} · 仕入 ${formatYen(purchaseTotal)} · 粗利 ${formatYen(profitTotal)}`
          : "案件に紐づく商品明細"
      }
      action={
        <Link
          href={`/cases/${caseId}/products/new`}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ＋ 商品を追加
        </Link>
      }
    >
      {error ? <ErrorText text={error} /> : null}
      {!error && products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center">
          <p className="text-sm text-gray-500">まだ商品が追加されていません。</p>
          <Link
            href={`/cases/${caseId}/products/new`}
            className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            最初の商品を追加する
          </Link>
        </div>
      ) : null}
      {!error && products.length > 0 ? (
        <div className="space-y-3">
          {products.map((row) => {
            const profitRate = formatProfitRate(row.salesPrice, row.grossProfit);

            return (
              <div
                key={row.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <Field label="種別" value={row.lineTypeLabel} />
                  <Field label={row.nameLabel} value={row.displayName} />
                  <Field label="メーカー" value={row.manufacturerName} />
                  <Field label="カテゴリ" value={row.category} />
                  <Field label="型番" value={row.modelNo} />
                  <Field label="仕入先" value={row.supplierName} />
                  <Field label="数量" value={row.quantity} />
                  <Field
                    label="仕入価格"
                    value={formatNullableYen(row.purchasePrice)}
                  />
                  <Field
                    label="販売価格"
                    value={formatNullableYen(row.salesPrice)}
                  />
                  <Field
                    label="粗利"
                    value={formatNullableYen(row.grossProfit)}
                  />
                  <Field label="粗利率" value={profitRate} />
                </div>
                {row.memo.trim() ? (
                  <p className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-4 text-sm text-gray-600">
                    {row.memo}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </Section>
  );
}

function SettlementTab({
  caseId,
  settlement,
  loadError,
  dealerPaymentType,
  dealerId,
  invoices,
  orders,
  threePartyMoney,
}: {
  caseId: string;
  settlement: SettlementViewData | null;
  loadError?: string;
  dealerPaymentType?: string;
  dealerId?: string | null;
  invoices: InvoiceRow[];
  orders: OrderRow[];
  threePartyMoney: ThreePartyMoneyView;
}) {
  const [editingConditions, setEditingConditions] = useState(!settlement);
  const type = settlement?.settlementType || "";
  const isSansha = type === "3社間決済";
  const isCard = type === "カード";
  const panelProps = {
    caseId,
    dealerId: dealerId || null,
    financeCompanyDefault: settlement?.financeCompany || "",
    invoices,
    orders,
    money: threePartyMoney,
  };

  return (
    <Section
      title="決済"
      description="金額・債務を確定する画面。実支払は支払管理で処理します。"
    >
      {settlement ? (
        <div className="mb-4 grid gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="決済区分" value={settlement.settlementType} />
          {isSansha ? (
            <>
              <Field label="信販会社" value={settlement.financeCompany} />
              <Field label="承認番号" value={settlement.approvalNumber} />
            </>
          ) : null}
          {isCard ? (
            <Field label="カード会社名" value={settlement.cardBrand} />
          ) : null}
          <Field
            label="手数料率"
            value={
              settlement.feeRate != null ? `${settlement.feeRate}%` : ""
            }
          />
          <Field label="手数料額" value={formatYen(settlement.feeAmount)} />
          <Field
            label="前金率"
            value={
              settlement.depositRate != null
                ? `${settlement.depositRate}%`
                : ""
            }
          />
          <Field
            label="前金額"
            value={
              settlement.depositAmount != null
                ? formatYen(settlement.depositAmount)
                : ""
            }
          />
          {isSansha ? (
            <Field label="ローンステータス" value={settlement.loanStatus} />
          ) : null}
          {isCard ? (
            <Field label="カードステータス" value={settlement.cardStatus} />
          ) : null}
          <div className="sm:col-span-2">
            <Field label="支払条件" value={settlement.paymentTerms} />
          </div>
          {settlement.memo.trim() ? (
            <div className="sm:col-span-2 xl:col-span-4">
              <Field label="備考" value={settlement.memo} multiline />
            </div>
          ) : null}
        </div>
      ) : null}

      {settlement && !editingConditions ? (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setEditingConditions(true)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            決済条件を編集
          </button>
        </div>
      ) : (
        <div className="mb-6">
          {settlement ? (
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-500">決済条件の編集</p>
              <button
                type="button"
                onClick={() => setEditingConditions(false)}
                className="text-xs text-gray-500 underline hover:text-gray-800"
              >
                閉じる
              </button>
            </div>
          ) : null}
          <SettlementForm
            caseId={caseId}
            settlement={settlement}
            loadError={loadError}
            dealerPaymentType={dealerPaymentType}
          />
        </div>
      )}

      {isSansha ? (
        <>
          <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
            <p className="font-semibold">3社間の流れ（案件詳細 → 支払管理）</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sky-900/90">
              <li>
                請求・入金タブ（またはここ）で信販入金を登録する（着金後に実入金額を直接登録・予定不要）
              </li>
              <li>金額を確認して仕切を作成する（初期額 = 信販入金 − 有効請求合計）</li>
              <li>仕切を確定する</li>
              <li>
                販売店への実支払は{" "}
                <Link
                  href="/queues/payments-management"
                  className="font-medium underline"
                >
                  支払管理
                </Link>
                で処理する（入金済かつ未払いなら自動で並ぶ）
              </li>
            </ol>
          </div>
          <ThreePartyMoneyPanels
            {...panelProps}
            section="finance"
            variant="case_flow"
          />
          <ThreePartyMoneyPanels
            {...panelProps}
            section="dealer"
            variant="case_flow"
          />
        </>
      ) : null}
    </Section>
  );
}

function PurchaseTab({
  caseId,
  orders,
  error,
}: {
  caseId: string;
  orders: OrderRow[];
  error?: string;
}) {
  const totalOrderAmount = orders
    .filter((order) => order.status !== "キャンセル" && order.status !== "取消")
    .reduce((sum, order) => sum + order.orderAmount, 0);

  return (
    <Section
      title="仕入"
      description={
        orders.length > 0
          ? `発注合計：${formatYen(totalOrderAmount)}`
          : "仕入先ごとの発注"
      }
      action={
        <Link
          href={`/cases/${caseId}/orders/new`}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ＋ 発注を作成
        </Link>
      }
    >
      {error ? <ErrorText text={error} /> : null}
      {!error && orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center">
          <p className="text-sm text-gray-500">
            発注情報はまだ登録されていません。
          </p>
          <Link
            href={`/cases/${caseId}/orders/new`}
            className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            最初の発注を登録する
          </Link>
        </div>
      ) : null}
      {!error && orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-lg border border-gray-200 p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <Field label="発注番号" value={order.orderNo} />
                <Field label="仕入先" value={order.supplierName} />
                <Field label="発注日" value={formatDate(order.orderDate)} />
                <Field
                  label="納品予定日"
                  value={formatDate(order.expectedDeliveryDate)}
                />
                <Field label="発注金額" value={formatYen(order.orderAmount)} />
                <div>
                  <p className="text-xs font-medium text-gray-400">発注状況</p>
                  <div className="mt-1.5">
                    <OrderStatusBadge status={order.status} />
                  </div>
                </div>
              </div>

              {order.lines.length > 0 ? (
                <div className="mt-4 overflow-x-auto border-t border-gray-100 pt-4">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs text-gray-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">メーカー</th>
                        <th className="py-2 pr-3 font-medium">型番</th>
                        <th className="py-2 pr-3 font-medium text-right">
                          数量
                        </th>
                        <th className="py-2 pr-3 font-medium text-right">
                          仕入単価
                        </th>
                        <th className="py-2 font-medium text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((line) => (
                        <tr key={line.id} className="border-t border-gray-50 align-top">
                          <td className="py-2 pr-3 text-gray-900">
                            {line.manufacturerName || "—"}
                            {line.components && line.components.length > 0 ? (
                              <ul className="mt-1 space-y-0.5 text-xs font-normal text-gray-500">
                                {line.components.map((c) => (
                                  <li key={c.id}>
                                    構成：
                                    {[c.manufacturerName, c.modelNo]
                                      .filter(Boolean)
                                      .join(" / ") || "—"}
                                    <span className="ml-1 tabular-nums">
                                      × {c.quantity.toLocaleString("ja-JP")}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-gray-700">
                            {line.modelNo || "—"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-700">
                            {line.quantity.toLocaleString("ja-JP")}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-700">
                            {formatYen(line.unitPrice)}
                          </td>
                          <td className="py-2 text-right tabular-nums font-medium text-gray-900">
                            {formatYen(line.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {order.memo.trim() ? (
                <p className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-4 text-sm text-gray-600">
                  {order.memo}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                <Link
                  href={`/orders/${order.id}`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  発注詳細
                </Link>
                <Link
                  href={`/orders/${order.id}/edit`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  編集
                </Link>
                <Link
                  href={`/orders/${order.id}/print`}
                  target="_blank"
                  className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
                >
                  発注書PDF
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  );
}

function DeliveryTab({
  orders,
  caseData,
}: {
  orders: OrderRow[];
  caseData: CaseDetailViewData;
}) {
  const summary = summarizeDeliveries(orders);
  const activeOrders = orders.filter(
    (order) => order.status !== "キャンセル" && order.status !== "取消"
  );

  return (
    <Section title="納品" description="施工店倉庫への納品予定・実績">
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field label="納品先（案件）" value={caseData.deliveryAddress} />
        <Field
          label="希望納品日"
          value={formatDate(caseData.desiredDeliveryDate)}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="対象発注" value={`${summary.total}件`} />
        <MiniStat label="納品済" value={`${summary.delivered}件`} />
        <MiniStat label="納品予定" value={`${summary.scheduled}件`} />
        <MiniStat
          label="遅延"
          value={`${summary.overdue}件`}
          alert={summary.overdue > 0}
        />
      </div>

      {activeOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center">
          <p className="text-sm text-gray-500">
            仕入発注がないため、納品対象はまだありません。
          </p>
          <Link
            href={`/cases/${caseData.id}/orders/new`}
            className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            発注を作成する
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {activeOrders.map((order) => {
            const deliveryStatus = getDeliveryStatus(order);
            return (
              <div
                key={order.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <Field label="仕入先" value={order.supplierName} />
                  <Field label="発注番号" value={order.orderNo} />
                  <Field
                    label="納品予定日"
                    value={formatDate(order.expectedDeliveryDate)}
                  />
                  <Field
                    label="納品日"
                    value={formatDate(order.deliveredDate)}
                  />
                  <div>
                    <p className="text-xs font-medium text-gray-400">納品状況</p>
                    <div className="mt-1.5">
                      <DeliveryStatusBadge status={deliveryStatus} />
                    </div>
                  </div>
                </div>

                {order.deliveryLines.length > 0 ? (
                  <div className="mt-4 overflow-x-auto border-t border-gray-100 pt-4">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs text-gray-500">
                        <tr>
                          <th className="py-2 pr-3 font-medium">メーカー</th>
                          <th className="py-2 pr-3 font-medium">型番</th>
                          <th className="py-2 pr-3 font-medium text-right">
                            数量
                          </th>
                          <th className="py-2 pr-3 font-medium">納品予定</th>
                          <th className="py-2 font-medium">納品日</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.deliveryLines.map((line) => (
                          <tr key={line.id} className="border-t border-gray-50">
                            <td className="py-2 pr-3 text-gray-900">
                              {line.manufacturerName || "—"}
                            </td>
                            <td className="py-2 pr-3 text-gray-700">
                              {line.modelNo || "—"}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-gray-700">
                              {line.quantity.toLocaleString("ja-JP")}
                            </td>
                            <td className="py-2 pr-3 text-gray-700">
                              {formatDate(order.expectedDeliveryDate)}
                            </td>
                            <td className="py-2 text-gray-700">
                              {formatDate(order.deliveredDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                  <Link
                    href={`/orders/${order.id}`}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    発注詳細
                  </Link>
                  {deliveryStatus !== "納品済" ? (
                    <Link
                      href={`/orders/${order.id}/edit`}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
                    >
                      納品確認
                    </Link>
                  ) : (
                    <Link
                      href={`/orders/${order.id}/edit`}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      納品内容を確認
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        日常の納品確認は
        <Link
          href="/queues/deliveries"
          className="mx-1 font-medium text-gray-700 underline"
        >
          納品管理
        </Link>
        からも行えます。分納（deliveries テーブル）は未対応で、現在は発注単位の納品予定日・納品日を参照します。
      </p>
    </Section>
  );
}

function InvoiceReceiptTab({
  caseId,
  invoices,
  payments,
  totals,
  invoiceError,
  paymentError,
  settlementType,
  dealerId,
  orders,
  threePartyMoney,
  financeCompanyDefault,
}: {
  caseId: string;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  totals: { invoiceAmount: number; paidIn: number; unpaid: number };
  invoiceError?: string;
  paymentError?: string;
  settlementType: string;
  dealerId?: string | null;
  orders: OrderRow[];
  threePartyMoney: ThreePartyMoneyView;
  financeCompanyDefault: string;
}) {
  const isSansha = settlementType === "3社間決済";
  const invoiceNoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const inv of invoices) {
      map.set(inv.id, inv.invoiceNo || inv.id);
    }
    return map;
  }, [invoices]);

  const openInvoice = invoices.find((invoice) => {
    if (invoice.status === "取消") {
      return false;
    }
    const paid = payments.reduce((sum, payment) => {
      if (payment.invoiceId !== invoice.id || payment.status === "取消") {
        return sum;
      }
      return sum + payment.paymentAmount;
    }, 0);
    return invoice.invoiceAmount - paid > 0;
  });

  const paidFinance = threePartyMoney.financeReceipts.find(
    (r) => r.status === "入金済"
  );
  const financeAmountDisplay =
    paidFinance?.actualAmount ??
    paidFinance?.scheduledAmount ??
    null;
  const invoiceTotalForRecovery = sumActiveInvoiceAmounts(invoices);
  const dealerPaidForRecovery = sumDealerPaidAmount(
    threePartyMoney.dealerSettlements.map((s) => ({
      status: s.status,
      actualPayoutAmount: s.actualPayoutAmount,
      payoutAmount: s.payoutAmount,
    }))
  );
  const recovery = computeThreePartyRecoveryAmounts({
    invoiceTotalAmount: invoiceTotalForRecovery,
    financePaidAmount: financeAmountDisplay,
    dealerPaidAmount: dealerPaidForRecovery,
  });

  return (
    <Section
      title="請求・入金"
      description={
        isSansha
          ? "商品請求と信販入金（契約金額）を分けて管理します。顧客入金とは別です。"
          : "請求・入金状況をこの案件単位で管理します"
      }
      action={
        <Link
          href={`/cases/${caseId}/invoices/new`}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ＋ 請求登録
        </Link>
      }
    >
      {isSansha ? (
        <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm text-teal-950">
          <p className="font-semibold">3社間決済: 請求額と信販入金額は別物です</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-teal-900/90">
            <li>商品請求額 … Value Ecology が請求する金額</li>
            <li>
              信販入金額 … 信販会社から実際に振り込まれた契約金額（finance_receipts）
            </li>
            <li>実質回収額 = 信販入金額 − 販売店支払額</li>
            <li>未入金残高 = 商品請求額 − 実質回収額</li>
            <li>仕切初期額 = 信販入金額 − 有効請求額合計（手数料の自動控除なし）</li>
          </ul>
        </div>
      ) : null}

      {isSansha ? (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="商品請求合計" value={formatYen(totals.invoiceAmount)} />
          <MiniStat
            label="信販入金額"
            value={
              financeAmountDisplay != null
                ? formatYen(financeAmountDisplay)
                : "—"
            }
          />
          <MiniStat
            label="実質回収額"
            value={formatYen(recovery.effectiveRecoveryAmount)}
          />
          <MiniStat
            label="未入金残高"
            value={formatYen(recovery.unpaidBalance)}
            alert={recovery.unpaidBalance > 0}
          />
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <MiniStat label="請求合計" value={formatYen(totals.invoiceAmount)} />
          <MiniStat label="入金済み" value={formatYen(totals.paidIn)} />
          <MiniStat
            label="未入金残高"
            value={formatYen(totals.unpaid)}
            alert={totals.unpaid > 0}
          />
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {isSansha ? "商品請求" : "請求"}
          </h3>
        </div>

        {invoiceError ? <ErrorText text={invoiceError} /> : null}

        {!invoiceError && invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center">
            <p className="text-sm text-gray-500">
              請求情報はまだ登録されていません。
            </p>
            <Link
              href={`/cases/${caseId}/invoices/new`}
              className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              最初の請求を登録する
            </Link>
          </div>
        ) : null}

        {!invoiceError && invoices.length > 0 ? (
          <div className="space-y-3">
            {invoices.map((invoice) => {
              const invoicePaidAmount = payments.reduce((sum, payment) => {
                if (
                  payment.invoiceId !== invoice.id ||
                  payment.status === "取消"
                ) {
                  return sum;
                }
                return sum + payment.paymentAmount;
              }, 0);
              const invoiceRemainingAmount = Math.max(
                invoice.invoiceAmount - invoicePaidAmount,
                0
              );

              return (
                <div
                  key={invoice.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                    <Field label="請求番号" value={invoice.invoiceNo} />
                    <Field
                      label="請求日"
                      value={formatDate(invoice.invoiceDate)}
                    />
                    <Field
                      label="支払期限"
                      value={formatDate(invoice.dueDate)}
                    />
                    <Field
                      label={isSansha ? "商品請求金額" : "請求金額"}
                      value={formatYen(invoice.invoiceAmount)}
                    />
                    <Field
                      label={isSansha ? "顧客入金残高（参考）" : "入金残高"}
                      value={formatYen(invoiceRemainingAmount)}
                    />
                    <div>
                      <p className="text-xs font-medium text-gray-400">
                        ステータス
                      </p>
                      <div className="mt-1.5">
                        <InvoiceStatusBadge status={invoice.status} />
                      </div>
                    </div>
                  </div>

                  {invoice.memo.trim() ? (
                    <p className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-4 text-sm text-gray-600">
                      {invoice.memo}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                    <Link
                      href={`/invoices/${invoice.id}?from=case`}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      請求詳細
                    </Link>
                    <Link
                      href={`/invoices/${invoice.id}/print`}
                      target="_blank"
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      請求書PDF
                    </Link>
                    {!isSansha &&
                    invoiceRemainingAmount > 0 &&
                    invoice.status !== "取消" ? (
                      <Link
                        href={`/invoices/${invoice.id}/payments/new`}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
                      >
                        ＋ 入金登録
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {isSansha ? (
        <ThreePartyMoneyPanels
          caseId={caseId}
          dealerId={dealerId || null}
          financeCompanyDefault={financeCompanyDefault}
          invoices={invoices}
          orders={orders}
          money={threePartyMoney}
          section="finance"
          variant="case_flow"
        />
      ) : null}

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {isSansha ? "顧客入金（通常決済用・参考）" : "入金"}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {isSansha
                ? "請求に対する顧客入金です。3社間の信販入金とは別です（通常は使いません）。"
                : "請求に対する入金実績"}
            </p>
          </div>
          {!isSansha && openInvoice ? (
            <Link
              href={`/invoices/${openInvoice.id}/payments/new`}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ＋ 入金登録
            </Link>
          ) : !isSansha && invoices.length === 0 ? (
            <Link
              href={`/cases/${caseId}/invoices/new`}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ＋ 先に請求を作成
            </Link>
          ) : null}
        </div>

        {paymentError ? <ErrorText text={paymentError} /> : null}

        {!paymentError && payments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center">
            <p className="text-sm text-gray-500">
              {isSansha
                ? "顧客入金の実績はありません（3社間は上の信販入金を使います）。"
                : "入金実績はまだありません。"}
            </p>
            {!isSansha && openInvoice ? (
              <Link
                href={`/invoices/${openInvoice.id}/payments/new`}
                className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                最初の入金を登録する
              </Link>
            ) : null}
          </div>
        ) : null}

        {!paymentError && payments.length > 0 ? (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Field
                    label="入金日"
                    value={formatDate(payment.paymentDate)}
                  />
                  <Field
                    label="入金金額"
                    value={formatYen(payment.paymentAmount)}
                  />
                  <Field
                    label="請求番号"
                    value={
                      payment.invoiceId
                        ? invoiceNoById.get(payment.invoiceId) ||
                          payment.invoiceId
                        : ""
                    }
                  />
                  <div>
                    <p className="text-xs font-medium text-gray-400">
                      ステータス
                    </p>
                    <div className="mt-1.5">
                      <PaymentStatusBadge status={payment.status} />
                    </div>
                  </div>
                </div>
                {payment.memo.trim() ? (
                  <p className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-4 text-sm text-gray-600">
                    {payment.memo}
                  </p>
                ) : null}
                {payment.invoiceId ? (
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                    <Link
                      href={`/invoices/${payment.invoiceId}?from=case`}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      請求詳細
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {isSansha ? (
        <ThreePartyMoneyPanels
          caseId={caseId}
          dealerId={dealerId || null}
          financeCompanyDefault={financeCompanyDefault}
          invoices={invoices}
          orders={orders}
          money={threePartyMoney}
          section="dealer"
          variant="case_flow"
        />
      ) : null}
    </Section>
  );
}

function PaymentTab({
  caseId,
  orders,
  dealerId,
  invoices,
  threePartyMoney,
  financeCompanyDefault,
  settlementType,
}: {
  caseId: string;
  orders: OrderRow[];
  dealerId?: string | null;
  invoices: InvoiceRow[];
  threePartyMoney: ThreePartyMoneyView;
  financeCompanyDefault: string;
  settlementType: string;
}) {
  const summary = summarizePayments(orders);
  const activeOrders = orders.filter(
    (order) => order.status !== "キャンセル" && order.status !== "取消"
  );
  const settlementLabel = settlementType.trim() || "未設定";

  return (
    <Section
      title="支払"
      description="仕入先支払の履歴・例外操作。日常の支払処理は支払管理へ。"
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniStat label="支払対象合計" value={formatYen(summary.targetAmount)} />
        <MiniStat
          label="納品済（支払準備）"
          value={formatYen(summary.readyAmount)}
        />
        <MiniStat
          label="未納品（支払待ち）"
          value={formatYen(summary.pendingAmount)}
        />
      </div>

      <div className="mb-4 rounded-lg border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
        <p>
          決済区分（{settlementLabel}）に関わらず、納品済みかつ仕入先未払いの発注は
          <Link
            href="/queues/payments-management?tab=supplier"
            className="mx-1 font-medium underline"
          >
            支払管理
          </Link>
          に自動表示されます（supplier_payments の事前作成は不要）。ここは確認・取消・訂正などの例外操作用です。
        </p>
      </div>
      <ThreePartyMoneyPanels
        caseId={caseId}
        dealerId={dealerId || null}
        financeCompanyDefault={financeCompanyDefault}
        invoices={invoices}
        orders={orders}
        money={threePartyMoney}
        section="supplier"
        variant="case_flow"
      />

      {activeOrders.length > 0 ? (
        <div className="mt-8 space-y-3 border-t border-gray-100 pt-6">
          <h3 className="text-sm font-semibold text-gray-900">発注一覧（参考）</h3>
          {activeOrders.map((order) => {
            const deliveryStatus = getDeliveryStatus(order);
            return (
              <div
                key={order.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="仕入先" value={order.supplierName} />
                  <Field label="発注番号" value={order.orderNo} />
                  <Field label="発注金額" value={formatYen(order.orderAmount)} />
                  <Field label="納品" value={deliveryStatus} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Section>
  );
}

function ProfitTab({
  products,
  invoices,
  orders,
  totals,
  settlement,
}: {
  products: CaseProductRow[];
  invoices: InvoiceRow[];
  orders: OrderRow[];
  totals: {
    paidIn: number;
    unpaid: number;
  };
  settlement: SettlementViewData | null;
}) {
  const feeInput = settlement
    ? { feeAmount: settlement.feeAmount, feeRate: settlement.feeRate }
    : null;

  const confirmed = computeConfirmedCaseProfit({
    invoices: invoices.map((i) => ({
      status: i.status,
      invoiceAmount: i.invoiceAmount,
    })),
    orders: orders.map((o) => ({
      status: o.status,
      orderAmount: o.orderAmount,
    })),
    fee: feeInput,
  });

  const forecast = computeForecastCaseProfit({
    products: products.map((p) => ({
      salesPrice: p.salesPrice,
      purchasePrice: p.purchasePrice,
    })),
    fee: feeInput,
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <p className="font-semibold">粗利 v1</p>
        <p className="mt-1 text-xs leading-relaxed text-sky-900/90">
          確定粗利は請求・発注ベース（有効請求 − 有効発注 −
          決済手数料）です。顧客入金・信販入金・販売店仕切・仕入先支払タイミングはキャッシュフローのため粗利に含めません。見込粗利は商品価格の参考表示です。経営ダッシュボードの
          KPI とは集計基準が異なる場合があります。
        </p>
      </div>

      <Section
        title="決済条件の反映"
        description="確定・見込粗利の決済手数料に使用"
      >
        {settlement ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="決済区分" value={settlement.settlementType} />
            <Field
              label="手数料率"
              value={
                settlement.feeRate != null ? `${settlement.feeRate}%` : ""
              }
            />
            <Field label="手数料額" value={formatYen(settlement.feeAmount)} />
            <Field
              label="前金額"
              value={
                settlement.depositAmount != null
                  ? formatYen(settlement.depositAmount)
                  : ""
              }
            />
          </div>
        ) : (
          <EmptyState
            title="決済条件は未設定です"
            body="決済タブで条件を保存すると、手数料が粗利計算に反映されます。"
          />
        )}
      </Section>

      <Section
        title="確定粗利（請求・発注ベース）"
        description="売上＝有効請求額合計 / 仕入＝有効発注額合計 / 手数料＝case_settlements"
      >
        <ProfitLines
          rows={[
            { label: "売上（有効請求合計）", value: confirmed.revenue },
            { label: "仕入原価（有効発注合計）", value: -confirmed.cost },
            { label: "決済手数料", value: -confirmed.fee },
          ]}
          profit={confirmed.profit}
          rate={confirmed.rate}
        />
        {totals.unpaid > 0 ? (
          <p className="mt-3 text-xs text-amber-700">
            顧客入金ベースの未入金残高 {formatYen(totals.unpaid)}
            （参考・粗利計算には未使用）
          </p>
        ) : null}
      </Section>

      <Section
        title="見込粗利（参考）"
        description="商品売価・仕入値ベース。確定粗利とは別の参考表示"
      >
        <ProfitLines
          rows={[
            { label: "売上（商品売価）", value: forecast.revenue },
            { label: "仕入原価（商品仕入）", value: -forecast.cost },
            { label: "決済手数料（見込）", value: -forecast.fee },
          ]}
          profit={forecast.profit}
          rate={forecast.rate}
        />
        {forecast.hasUnsetPrices ? (
          <p className="mt-3 text-xs text-amber-700">
            価格未設定を含む — 見込金額は設定済み明細のみの合計です（0円確定ではありません）
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function ProfitLines({
  rows,
  profit,
  rate,
}: {
  rows: { label: string; value: number }[];
  profit: number;
  rate: number | null;
}) {
  return (
    <div className="space-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span className="text-gray-500">{row.label}</span>
          <span className="tabular-nums text-gray-900">
            {formatYen(row.value)}
          </span>
        </div>
      ))}
      <div className="my-3 border-t border-gray-200" />
      <div className="flex justify-between gap-4">
        <span className="font-medium text-gray-900">粗利</span>
        <span className="tabular-nums text-base font-semibold text-gray-900">
          {formatYen(profit)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-500">粗利率</span>
        <span className="tabular-nums text-gray-900">
          {rate == null ? "—" : `${rate.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200/80 bg-white p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-gray-900">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-sm text-gray-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p
        className={`mt-1 text-sm text-gray-900 ${
          multiline ? "whitespace-pre-wrap" : ""
        }`}
      >
        {display(value)}
      </p>
    </div>
  );
}

function MetaBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-gray-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-14 shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 break-words text-gray-800">
        {display(value)}
      </span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        alert
          ? "border-amber-200 bg-amber-50"
          : "border-gray-100 bg-[#f7f7f5]"
      }`}
    >
      <p className={`text-[11px] ${alert ? "text-amber-700" : "text-gray-400"}`}>
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-medium tabular-nums ${
          alert ? "text-amber-900" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-100" />;
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-gray-400">{text}</p>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-400">
        {body}
      </p>
    </div>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {text}
    </p>
  );
}

function OrderStatusBadge({ status }: { status: string | null }) {
  const currentStatus = status || "未発注";
  const styles: Record<string, string> = {
    未発注: "bg-gray-100 text-gray-700",
    発注済: "bg-blue-100 text-blue-700",
    納品済: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
        styles[currentStatus] || "bg-gray-100 text-gray-700"
      }`}
    >
      {currentStatus}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string | null }) {
  const currentStatus = status || "未請求";
  const styles: Record<string, string> = {
    未請求: "bg-gray-100 text-gray-700",
    請求書作成済: "bg-yellow-100 text-yellow-700",
    請求済: "bg-blue-100 text-blue-700",
    入金待ち: "bg-red-100 text-red-700",
    一部入金: "bg-orange-100 text-orange-700",
    入金済: "bg-green-100 text-green-700",
    取消: "bg-gray-200 text-gray-600",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
        styles[currentStatus] || "bg-gray-100 text-gray-700"
      }`}
    >
      {currentStatus}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  const currentStatus = status || "入金確認済";
  const styles: Record<string, string> = {
    入金確認済: "bg-green-100 text-green-700",
    入金確認中: "bg-yellow-100 text-yellow-800",
    取消: "bg-gray-200 text-gray-600",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
        styles[currentStatus] || "bg-gray-100 text-gray-700"
      }`}
    >
      {currentStatus}
    </span>
  );
}

function DeliveryStatusBadge({ status }: { status: DeliveryStatusLabel }) {
  const styles: Record<DeliveryStatusLabel, string> = {
    納品済: "bg-green-100 text-green-700",
    納品予定: "bg-blue-100 text-blue-700",
    遅延: "bg-red-100 text-red-700",
    未納品: "bg-gray-100 text-gray-700",
    対象外: "bg-gray-200 text-gray-500",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function PaymentReadyBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
        ready
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {ready ? "支払準備OK" : "支払待ち"}
    </span>
  );
}
