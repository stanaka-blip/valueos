"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";

import StatusSelect from "../StatusSelect";
import TaskStatusSelect from "../../tasks/TaskStatusSelect";

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
  errors: {
    products?: string;
    orders?: string;
    invoices?: string;
    payments?: string;
    tasks?: string;
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
            {tab === "settlement" ? <SettlementTab /> : null}
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
                error={errors.invoices}
              />
            ) : null}
            {tab === "receipt" ? (
              <ReceiptTab
                payments={payments}
                invoices={invoices}
                totals={totals}
                error={errors.payments}
              />
            ) : null}
            {tab === "payment" ? <PaymentTab orders={orders} /> : null}
            {tab === "profit" ? <ProfitTab totals={totals} /> : null}
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
    <div className="space-y-8">
      <Section title="基本情報" description="案件の身元と納期">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <Field label="案件番号" value={caseData.caseNo} />
          <Field label="登録日時" value={formatDateTime(caseData.createdAt)} />
          <Field label="販売店" value={caseData.dealerName} />
          <Field label="担当者" value={caseData.assignedUser} />
          <Field label="顧客名" value={caseData.customerName} />
          <Field label="電話番号" value={caseData.customerPhone} />
          <Field label="発注区分" value={caseData.orderType} />
          <Field
            label="希望納品日"
            value={formatDate(caseData.desiredDeliveryDate)}
          />
          <div className="sm:col-span-2">
            <Field label="納品先住所" value={caseData.deliveryAddress} />
          </div>
          <div className="sm:col-span-2">
            <Field label="設置先住所" value={caseData.siteAddress} />
          </div>
          <div className="sm:col-span-2">
            <Field label="備考" value={caseData.memo} multiline />
          </div>
        </div>
      </Section>

      <Section
        title="タスク"
        description="この案件の社内タスク"
        action={
          <Link
            href={`/tasks/new?case_id=${caseData.id}`}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ＋ 追加
          </Link>
        }
      >
        {tasksError ? (
          <ErrorText text={tasksError} />
        ) : tasks.length === 0 ? (
          <Empty text="タスクはまだありません" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {display(task.title)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    期限 {formatDate(task.dueDate)} · {display(task.assignedUser)}
                  </p>
                </div>
                <TaskStatusSelect
                  taskId={task.id}
                  currentStatus={task.status}
                />
              </li>
            ))}
          </ul>
        )}
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
  return (
    <Section
      title="商品"
      description="案件に紐づく商品明細"
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
        <Empty text="商品が登録されていません" />
      ) : null}
      {!error && products.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-400">
                <th className="pb-2 pr-4 font-medium">メーカー</th>
                <th className="pb-2 pr-4 font-medium">商品</th>
                <th className="pb-2 pr-4 font-medium">型番</th>
                <th className="pb-2 pr-4 font-medium">数量</th>
                <th className="pb-2 pr-4 font-medium">仕入先</th>
                <th className="pb-2 pr-4 font-medium">売価</th>
                <th className="pb-2 font-medium">仕入</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="py-3 pr-4 text-gray-600">
                    {display(row.manufacturerName)}
                  </td>
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {display(row.productName)}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">
                    {display(row.modelNo)}
                  </td>
                  <td className="py-3 pr-4">{display(row.quantity)}</td>
                  <td className="py-3 pr-4 text-gray-600">
                    {display(row.supplierName)}
                  </td>
                  <td className="py-3 pr-4">{formatYen(row.salesPrice)}</td>
                  <td className="py-3">{formatYen(row.purchasePrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

function SettlementTab() {
  return (
    <Section title="決済" description="決済フローと入金・請求の条件">
      <EmptyState
        title="決済条件は未設定です"
        body="Ver1.0では case_settlements 連携後に、3社間 / 前金 / 掛売 / カードをここで設定します。"
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
  return (
    <Section
      title="仕入"
      description="仕入先ごとの発注"
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
        <Empty text="仕入発注はまだありません" />
      ) : null}
      <div className="space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="block rounded-lg border border-gray-200 bg-white px-4 py-3 transition hover:border-gray-300"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {display(order.supplierName)}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  発注日 {formatDate(order.orderDate)} ·{" "}
                  {display(order.orderNo)}
                </p>
              </div>
              <div className="text-right">
                <StatusPill text={order.status} />
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {formatYen(order.orderAmount)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
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
  error,
}: {
  caseId: string;
  invoices: InvoiceRow[];
  error?: string;
}) {
  return (
    <Section
      title="請求"
      description="請求書の作成と状況"
      action={
        <Link
          href={`/cases/${caseId}/invoices/new`}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ＋ 請求を作成
        </Link>
      }
    >
      {error ? <ErrorText text={error} /> : null}
      {!error && invoices.length === 0 ? (
        <Empty text="請求はまだありません" />
      ) : null}
      <div className="space-y-3">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                {display(invoice.invoiceNo)}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                請求日 {formatDate(invoice.invoiceDate)} · 期限{" "}
                {formatDate(invoice.dueDate)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill text={invoice.status} />
              <span className="text-sm font-medium">
                {formatYen(invoice.invoiceAmount)}
              </span>
              <Link
                href={`/invoices/${invoice.id}/print`}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                PDF
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ReceiptTab({
  payments,
  invoices,
  totals,
  error,
}: {
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

  return (
    <Section title="入金" description="請求に対する入金実績">
      <div className="mb-6 grid grid-cols-3 gap-3">
        <MiniStat label="請求合計" value={formatYen(totals.invoiceAmount)} />
        <MiniStat label="入金合計" value={formatYen(totals.paidIn)} />
        <MiniStat label="未入金" value={formatYen(totals.unpaid)} />
      </div>
      {error ? <ErrorText text={error} /> : null}
      {!error && payments.length === 0 ? (
        <Empty text="入金実績はまだありません" />
      ) : null}
      <ul className="divide-y divide-gray-100">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-gray-900">
                {formatYen(payment.paymentAmount)}
              </p>
              <p className="text-xs text-gray-500">
                {formatDate(payment.paymentDate)} · 請求{" "}
                {payment.invoiceId
                  ? display(invoiceNoById.get(payment.invoiceId))
                  : "—"}
              </p>
            </div>
            <StatusPill text={payment.status || "有効"} />
          </li>
        ))}
      </ul>
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
}) {
  const fee = 0;
  const other = 0;
  const forecastProfit = totals.sales - totals.purchase - other - fee;
  const actualProfit = totals.paidIn - totals.orderAmount - other - fee;
  const forecastRate =
    totals.sales > 0 ? (forecastProfit / totals.sales) * 100 : null;
  const actualRate =
    totals.paidIn > 0 ? (actualProfit / totals.paidIn) * 100 : null;

  return (
    <div className="space-y-6">
      <Section title="確定粗利（参考）" description="入金・発注額ベースの簡易計算">
        <ProfitLines
          rows={[
            { label: "売上（入金合計）", value: totals.paidIn },
            { label: "仕入原価（発注合計）", value: -totals.orderAmount },
            { label: "その他支払", value: -other },
            { label: "決済手数料", value: -fee },
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
            { label: "決済手数料", value: -fee },
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-[#f7f7f5] px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-gray-900">
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

function StatusPill({ text }: { text: string }) {
  return (
    <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
      {text || "—"}
    </span>
  );
}
