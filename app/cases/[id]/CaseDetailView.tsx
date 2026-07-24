"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";

import StatusSelect from "../StatusSelect";
import TaskStatusSelect from "../../tasks/TaskStatusSelect";
import SettlementForm from "./SettlementForm";
import type { SettlementViewData } from "./settlementView";

export type CaseDetailTabId =
  | "basic"
  | "products"
  | "settlement"
  | "purchase"
  | "delivery"
  | "invoice"
  | "receipt"
  | "payment"
  | "profit";

const TABS: { id: CaseDetailTabId; label: string }[] = [
  { id: "basic", label: "基本情報" },
  { id: "products", label: "商品" },
  { id: "settlement", label: "決済" },
  { id: "purchase", label: "仕入" },
  { id: "delivery", label: "納品" },
  { id: "invoice", label: "請求" },
  { id: "receipt", label: "入金" },
  { id: "payment", label: "支払" },
  { id: "profit", label: "粗利" },
];

export type CaseDetailViewData = {
  id: string;
  caseNo: string;
  status: string | null;
  createdAt: string | null;
  dealerName: string;
  dealerContact: string;
  customerName: string;
  customerPhone: string;
  siteAddress: string;
  deliveryAddress: string;
  desiredDeliveryDate: string | null;
  constructionDate: string | null;
  constructionDetail: string;
  orderType: string;
  assignedUser: string;
  department: string;
  priority: string;
  memo: string;
  productName: string;
  quantity: string;
};

export type CaseProductRow = {
  id: string;
  productName: string;
  modelNo: string;
  category: string;
  manufacturerName: string;
  supplierName: string;
  quantity: string;
  purchasePrice: number;
  salesPrice: number;
  grossProfit: number;
  memo: string;
};

export type OrderRow = {
  id: string;
  orderNo: string;
  supplierName: string;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  orderAmount: number;
  status: string;
  memo: string;
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
  dealerPaymentType?: string;
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

export default function CaseDetailView({
  caseData,
  products,
  orders,
  invoices,
  payments,
  tasks,
  settlement,
  dealerPaymentType,
  errors,
}: CaseDetailViewProps) {
  const [tab, setTab] = useState<CaseDetailTabId>("basic");

  const totals = useMemo(() => {
    const sales = products.reduce((s, p) => s + p.salesPrice, 0);
    const purchase = products.reduce((s, p) => s + p.purchasePrice, 0);
    const profit = products.reduce((s, p) => s + p.grossProfit, 0);
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

  function resolveFee(baseAmount: number): number {
    if (!settlement) {
      return 0;
    }
    if (settlement.feeAmount > 0) {
      return settlement.feeAmount;
    }
    if (settlement.feeRate != null && settlement.feeRate > 0) {
      return (baseAmount * settlement.feeRate) / 100;
    }
    return 0;
  }

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
            <Link
              href={`/cases/${caseData.id}/products/new`}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              商品追加
            </Link>
            <Link
              href={`/cases/${caseData.id}/orders/new`}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              仕入発注
            </Link>
            <Link
              href={`/cases/${caseData.id}/invoices/new`}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              請求登録
            </Link>
          </div>
        </div>
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
              <MetaRow label="担当" value={caseData.assignedUser} />
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
            </MetaBlock>

            <Divider />

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="売上" value={formatYen(totals.sales)} />
              <MiniStat label="粗利" value={formatYen(totals.profit)} />
            </div>

            <p className="text-xs text-gray-400">
              登録 {formatDateTime(caseData.createdAt)}
            </p>
          </div>
        </aside>

        {/* Right: tabs */}
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
          </div>

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

          <div className="p-6 md:p-8">
            {tab === "basic" ? (
              <BasicTab caseData={caseData} tasks={tasks} tasksError={errors.tasks} />
            ) : null}
            {tab === "products" ? (
              <ProductsTab
                caseId={caseData.id}
                products={products}
                error={errors.products}
              />
            ) : null}
            {tab === "settlement" ? (
              <SettlementTab
                caseId={caseData.id}
                settlement={settlement}
                loadError={errors.settlement}
                dealerPaymentType={dealerPaymentType}
              />
            ) : null}
            {tab === "purchase" ? (
              <PurchaseTab
                caseId={caseData.id}
                orders={orders}
                error={errors.orders}
              />
            ) : null}
            {tab === "delivery" ? (
              <DeliveryTab orders={orders} caseData={caseData} />
            ) : null}
            {tab === "invoice" ? (
              <InvoiceTab
                caseId={caseData.id}
                invoices={invoices}
                payments={payments}
                error={errors.invoices}
              />
            ) : null}
            {tab === "receipt" ? (
              <ReceiptTab
                caseId={caseData.id}
                payments={payments}
                invoices={invoices}
                totals={totals}
                error={errors.payments}
              />
            ) : null}
            {tab === "payment" ? <PaymentTab orders={orders} /> : null}
            {tab === "profit" ? (
              <ProfitTab
                totals={totals}
                settlement={settlement}
                resolveFee={resolveFee}
              />
            ) : null}
          </div>
        </main>
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
      <Section title="基本情報" description="案件の身元と納期">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="案件番号" value={caseData.caseNo} />
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
  const salesTotal = products.reduce((sum, row) => sum + row.salesPrice, 0);
  const purchaseTotal = products.reduce(
    (sum, row) => sum + row.purchasePrice,
    0
  );
  const profitTotal = products.reduce((sum, row) => sum + row.grossProfit, 0);

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
            const profitRate =
              row.salesPrice > 0
                ? `${((row.grossProfit / row.salesPrice) * 100).toFixed(1)}%`
                : "—";

            return (
              <div
                key={row.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <Field label="メーカー" value={row.manufacturerName} />
                  <Field label="カテゴリ" value={row.category} />
                  <Field label="品番" value={row.modelNo} />
                  <Field label="商品名" value={row.productName} />
                  <Field label="仕入先" value={row.supplierName} />
                  <Field label="数量" value={row.quantity} />
                  <Field label="仕入価格" value={formatYen(row.purchasePrice)} />
                  <Field label="販売価格" value={formatYen(row.salesPrice)} />
                  <Field label="粗利" value={formatYen(row.grossProfit)} />
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
}: {
  caseId: string;
  settlement: SettlementViewData | null;
  loadError?: string;
  dealerPaymentType?: string;
}) {
  return (
    <Section title="決済" description="決済フローと入金・請求の条件">
      {settlement ? (
        <div className="mb-6 grid gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="決済区分" value={settlement.settlementType} />
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
          <Field label="カード" value={settlement.cardBrand} />
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

      <SettlementForm
        caseId={caseId}
        settlement={settlement}
        loadError={loadError}
        dealerPaymentType={dealerPaymentType}
      />
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
  return (
    <Section title="納品" description="施工店倉庫への納品予定・実績">
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Field label="納品先（案件）" value={caseData.deliveryAddress} />
        <Field
          label="希望納品日"
          value={formatDate(caseData.desiredDeliveryDate)}
        />
      </div>
      {orders.length === 0 ? (
        <Empty text="仕入発注がないため、納品対象はまだありません" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-400">
                <th className="pb-2 pr-4 font-medium">仕入先</th>
                <th className="pb-2 pr-4 font-medium">予定日</th>
                <th className="pb-2 pr-4 font-medium">納品日</th>
                <th className="pb-2 font-medium">状態</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-gray-100">
                  <td className="py-3 pr-4">
                    {display(order.supplierName)}
                  </td>
                  <td className="py-3 pr-4">
                    {formatDate(order.expectedDeliveryDate)}
                  </td>
                  <td className="py-3 pr-4">
                    {formatDate(order.deliveredDate)}
                  </td>
                  <td className="py-3">
                    {order.deliveredDate
                      ? "納品済"
                      : order.expectedDeliveryDate
                        ? "納品予定"
                        : "未納品"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-400">
        分納対応の deliveries テーブル連携後、商品単位の実績登録に拡張します。
      </p>
    </Section>
  );
}

function InvoiceTab({
  caseId,
  invoices,
  payments,
  error,
}: {
  caseId: string;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  error?: string;
}) {
  const totalInvoiceAmount = invoices
    .filter((invoice) => invoice.status !== "取消")
    .reduce((sum, invoice) => sum + invoice.invoiceAmount, 0);
  const totalPaidAmount = payments
    .filter((payment) => payment.status !== "取消")
    .reduce((sum, payment) => sum + payment.paymentAmount, 0);
  const unpaidAmount = Math.max(totalInvoiceAmount - totalPaidAmount, 0);

  return (
    <Section
      title="請求"
      description="請求・入金状況をこの案件単位で管理します"
      action={
        <Link
          href={`/cases/${caseId}/invoices/new`}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ＋ 請求登録
        </Link>
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="請求合計" value={formatYen(totalInvoiceAmount)} />
        <MiniStat label="入金済み" value={formatYen(totalPaidAmount)} />
        <MiniStat
          label="未入金残高"
          value={formatYen(unpaidAmount)}
          alert={unpaidAmount > 0}
        />
      </div>

      {error ? <ErrorText text={error} /> : null}

      {!error && invoices.length === 0 ? (
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

      {!error && invoices.length > 0 ? (
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
                  <Field label="支払期限" value={formatDate(invoice.dueDate)} />
                  <Field
                    label="請求金額"
                    value={formatYen(invoice.invoiceAmount)}
                  />
                  <Field
                    label="入金残高"
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
                    href={`/invoices/${invoice.id}`}
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
                  {invoiceRemainingAmount > 0 && invoice.status !== "取消" ? (
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
    </Section>
  );
}

function ReceiptTab({
  caseId,
  payments,
  invoices,
  totals,
  error,
}: {
  caseId: string;
  payments: PaymentRow[];
  invoices: InvoiceRow[];
  totals: { invoiceAmount: number; paidIn: number; unpaid: number };
  error?: string;
}) {
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

  return (
    <Section
      title="入金"
      description="請求に対する入金実績"
      action={
        openInvoice ? (
          <Link
            href={`/invoices/${openInvoice.id}/payments/new`}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ＋ 入金登録
          </Link>
        ) : invoices.length === 0 ? (
          <Link
            href={`/cases/${caseId}/invoices/new`}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ＋ 先に請求を作成
          </Link>
        ) : undefined
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="請求合計" value={formatYen(totals.invoiceAmount)} />
        <MiniStat label="入金済み" value={formatYen(totals.paidIn)} />
        <MiniStat
          label="未入金残高"
          value={formatYen(totals.unpaid)}
          alert={totals.unpaid > 0}
        />
      </div>

      {error ? <ErrorText text={error} /> : null}

      {!error && payments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center">
          <p className="text-sm text-gray-500">入金実績はまだありません。</p>
          {openInvoice ? (
            <Link
              href={`/invoices/${openInvoice.id}/payments/new`}
              className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              最初の入金を登録する
            </Link>
          ) : null}
        </div>
      ) : null}

      {!error && payments.length > 0 ? (
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
                      ? invoiceNoById.get(payment.invoiceId) || payment.invoiceId
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
                    href={`/invoices/${payment.invoiceId}`}
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
    </Section>
  );
}

function PaymentTab({ orders }: { orders: OrderRow[] }) {
  const purchaseTotal = orders
    .filter((o) => o.status !== "キャンセル")
    .reduce((s, o) => s + o.orderAmount, 0);

  return (
    <Section title="支払" description="仕入先などへの支払">
      <div className="mb-6">
        <MiniStat label="発注合計（支払対象目安）" value={formatYen(purchaseTotal)} />
      </div>
      <EmptyState
        title="支払実績は未連携です"
        body="supplier_payments テーブル追加後、発注単位の支払予定・実績をここに表示します。現在は仕入発注額を参照用に表示しています。"
      />
      {orders.length > 0 ? (
        <ul className="mt-6 divide-y divide-gray-100">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex justify-between gap-3 py-3 text-sm"
            >
              <span className="text-gray-700">
                {display(order.supplierName)}
              </span>
              <span className="text-gray-900">
                {formatYen(order.orderAmount)}
                <span className="ml-2 text-xs text-gray-400">
                  {order.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function ProfitTab({
  totals,
  settlement,
  resolveFee,
}: {
  totals: {
    sales: number;
    purchase: number;
    profit: number;
    rate: number | null;
    paidIn: number;
    orderAmount: number;
    unpaid: number;
  };
  settlement: SettlementViewData | null;
  resolveFee: (baseAmount: number) => number;
}) {
  const other = 0;
  const forecastFee = resolveFee(totals.sales);
  const actualFee = resolveFee(totals.paidIn);
  const forecastProfit =
    totals.sales - totals.purchase - other - forecastFee;
  const actualProfit =
    totals.paidIn - totals.orderAmount - other - actualFee;
  const forecastRate =
    totals.sales > 0 ? (forecastProfit / totals.sales) * 100 : null;
  const actualRate =
    totals.paidIn > 0 ? (actualProfit / totals.paidIn) * 100 : null;

  return (
    <div className="space-y-6">
      <Section
        title="決済条件の反映"
        description="粗利計算に使う決済手数料・前金"
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

      <Section title="確定粗利（参考）" description="入金・発注額ベースの簡易計算">
        <ProfitLines
          rows={[
            { label: "売上（入金合計）", value: totals.paidIn },
            { label: "仕入原価（発注合計）", value: -totals.orderAmount },
            { label: "その他支払", value: -other },
            { label: "決済手数料", value: -actualFee },
          ]}
          profit={actualProfit}
          rate={actualRate}
        />
        {totals.unpaid > 0 ? (
          <p className="mt-3 text-xs text-amber-700">
            未入金 {formatYen(totals.unpaid)} — 確定粗利は暫定です
          </p>
        ) : null}
      </Section>

      <Section title="見込粗利（参考）" description="商品売価・仕入値ベース">
        <ProfitLines
          rows={[
            { label: "売上（商品売価）", value: totals.sales },
            { label: "仕入原価（商品仕入）", value: -totals.purchase },
            { label: "その他支払", value: -other },
            { label: "決済手数料", value: -forecastFee },
          ]}
          profit={forecastProfit}
          rate={forecastRate}
        />
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
    納期回答待ち: "bg-yellow-100 text-yellow-800",
    納期確定: "bg-purple-100 text-purple-700",
    一部納品: "bg-orange-100 text-orange-700",
    納品済: "bg-green-100 text-green-700",
    取消: "bg-gray-200 text-gray-600",
    キャンセル: "bg-gray-200 text-gray-600",
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
