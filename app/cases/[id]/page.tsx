import Link from "next/link";

import { supabase } from "@/lib/supabase";

import TaskStatusSelect from "../../tasks/TaskStatusSelect";
import StatusSelect from "../StatusSelect";

type Dealer = {
  name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};

type CaseDetail = {
  id: string;
  case_no: string | null;
  created_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  site_address: string | null;
  order_type: string | null;
  product_name: string | null;
  quantity: number | null;
  desired_delivery_date: string | null;
  delivery_address: string | null;
  construction_desired_date: string | null;
  construction_detail: string | null;
  status: string | null;
  department: string | null;
  assigned_user: string | null;
  priority: string | null;
  memo: string | null;
  dealers: Dealer | Dealer[] | null;
};

type ManufacturerRelation = {
  name: string | null;
};

type ProductRelation = {
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers:
    | ManufacturerRelation
    | ManufacturerRelation[]
    | null;
};

type SupplierRelation = {
  name: string | null;
};

type CaseProduct = {
  id: string;
  quantity: number | null;
  purchase_price: number | string | null;
  sales_price: number | string | null;
  gross_profit: number | string | null;
  memo: string | null;
  products: ProductRelation | ProductRelation[] | null;
  suppliers: SupplierRelation | SupplierRelation[] | null;
};

type Order = {
  id: string;
  order_no: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  delivered_date: string | null;
  order_amount: number | string | null;
  status: string | null;
  memo: string | null;
  suppliers: SupplierRelation | SupplierRelation[] | null;
};

type Invoice = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: number | string | null;
  status: string | null;
  memo: string | null;
};

type Payment = {
  id: string;
  invoice_id: string | null;
  payment_amount: number | string | null;
  status: string | null;
};

type Task = {
  id: string;
  title: string | null;
  due_date: string | null;
  assigned_user: string | null;
  status: string | null;
};

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [
    { data: caseData, error: caseError },
    { data: tasksData, error: tasksError },
    { data: caseProductsData, error: caseProductsError },
    { data: ordersData, error: ordersError },
    { data: invoicesData, error: invoicesError },
    { data: paymentsData, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select(`
        *,
        dealers (
          name,
          contact_name,
          phone,
          email
        )
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("tasks")
      .select(`
        id,
        title,
        due_date,
        assigned_user,
        status
      `)
      .eq("case_id", id)
      .order("due_date", {
        ascending: true,
        nullsFirst: false,
      }),

    supabase
      .from("case_products")
      .select(`
        id,
        quantity,
        purchase_price,
        sales_price,
        gross_profit,
        memo,
        products (
          name,
          model_no,
          category,
          manufacturers (
            name
          )
        ),
        suppliers (
          name
        )
      `)
      .eq("case_id", id)
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("orders")
      .select(`
        id,
        order_no,
        order_date,
        expected_delivery_date,
        delivered_date,
        order_amount,
        status,
        memo,
        suppliers (
          name
        )
      `)
      .eq("case_id", id)
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("invoices")
      .select(`
        id,
        invoice_no,
        invoice_date,
        due_date,
        invoice_amount,
        status,
        memo
      `)
      .eq("case_id", id)
      .order("invoice_date", {
        ascending: false,
        nullsFirst: false,
      }),

    supabase
      .from("payments")
      .select(`
        id,
        invoice_id,
        payment_amount,
        status
      `)
      .eq("case_id", id),
  ]);

  if (caseError || !caseData) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-xl font-bold text-gray-900">
            案件詳細
          </h1>
        </header>

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            案件取得エラー：
            {caseError?.message || "案件が見つかりません"}
          </div>

          <Link
            href="/cases"
            className="mt-5 inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700"
          >
            案件一覧へ戻る
          </Link>
        </main>
      </>
    );
  }

  const item = normalizeCase(caseData);
  const tasks = (tasksData || []) as Task[];
  const caseProducts = (caseProductsData || []) as CaseProduct[];
  const orders = (ordersData || []) as Order[];
  const invoices = (invoicesData || []) as Invoice[];
  const payments = (paymentsData || []) as Payment[];

  const totalPurchase = caseProducts.reduce(
    (sum, product) => sum + toNumber(product.purchase_price),
    0
  );

  const totalSales = caseProducts.reduce(
    (sum, product) => sum + toNumber(product.sales_price),
    0
  );

  const totalProfit = caseProducts.reduce(
    (sum, product) => sum + toNumber(product.gross_profit),
    0
  );

  const grossProfitRate =
    totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

  const totalOrderAmount = orders.reduce(
    (sum, order) => sum + toNumber(order.order_amount),
    0
  );

  const totalInvoiceAmount = invoices.reduce(
    (sum, invoice) => sum + toNumber(invoice.invoice_amount),
    0
  );

  const totalPaidAmount = payments.reduce((sum, payment) => {
    if (payment.status === "取消") {
      return sum;
    }

    return sum + toNumber(payment.payment_amount);
  }, 0);

  const unpaidAmount = Math.max(
    totalInvoiceAmount - totalPaidAmount,
    0
  );

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              案件詳細：{item.case_no || "-"}
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              顧客名：{item.customer_name || "-"} / 販売店：
              {item.dealers?.name || "-"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/cases"
              className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
            >
              一覧へ戻る
            </Link>

            <Link
              href={`/cases/${item.id}/invoices/new`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
            >
              ＋ 請求登録
            </Link>
          </div>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="販売合計"
            value={totalSales}
            suffix="円"
          />

          <SummaryCard
            label="仕入合計"
            value={totalPurchase}
            suffix="円"
          />

          <SummaryCard
            label="粗利合計"
            value={totalProfit}
            suffix="円"
          />

          <SummaryCard
            label="粗利率"
            value={grossProfitRate}
            suffix="%"
            decimals={1}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            基本情報
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Info label="案件番号" value={item.case_no} />

            <Info
              label="登録日"
              value={formatDateTime(item.created_at)}
            />

            <Info
              label="販売店"
              value={item.dealers?.name}
            />

            <Info
              label="販売店担当者"
              value={item.dealers?.contact_name}
            />

            <Info
              label="顧客名"
              value={item.customer_name}
            />

            <Info
              label="電話番号"
              value={item.customer_phone}
            />

            <Info
              label="施工先住所"
              value={item.site_address}
            />

            <Info
              label="発注区分"
              value={item.order_type}
            />

            <Info
              label="希望納期"
              value={formatDate(item.desired_delivery_date)}
            />

            <Info
              label="配送先"
              value={item.delivery_address}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">
              商品情報
            </h2>

            <Link
              href={`/cases/${item.id}/products/new`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              ＋ 商品追加
            </Link>
          </div>

          {caseProductsError ? (
            <ErrorBox
              message={`商品情報取得エラー：${caseProductsError.message}`}
            />
          ) : caseProducts.length > 0 ? (
            <div className="space-y-3">
              {caseProducts.map((caseProduct) => {
                const product = getSingleRelation(
                  caseProduct.products
                );

                const manufacturer = getSingleRelation(
                  product?.manufacturers
                );

                const supplier = getSingleRelation(
                  caseProduct.suppliers
                );

                return (
                  <div
                    key={caseProduct.id}
                    className="rounded-lg border p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <Info
                        label="メーカー"
                        value={manufacturer?.name}
                      />

                      <Info
                        label="カテゴリ"
                        value={product?.category}
                      />

                      <Info
                        label="品番"
                        value={product?.model_no}
                      />

                      <Info
                        label="商品名"
                        value={product?.name}
                      />

                      <Info
                        label="仕入先"
                        value={supplier?.name}
                      />

                      <Info
                        label="数量"
                        value={String(caseProduct.quantity ?? "-")}
                      />

                      <Info
                        label="仕入価格"
                        value={formatCurrency(
                          caseProduct.purchase_price
                        )}
                      />

                      <Info
                        label="販売価格"
                        value={formatCurrency(
                          caseProduct.sales_price
                        )}
                      />

                      <Info
                        label="粗利"
                        value={formatCurrency(
                          caseProduct.gross_profit
                        )}
                      />

                      <Info
                        label="粗利率"
                        value={
                          toNumber(caseProduct.sales_price) > 0
                            ? `${(
                                (toNumber(caseProduct.gross_profit) /
                                  toNumber(caseProduct.sales_price)) *
                                100
                              ).toFixed(1)}%`
                            : "-"
                        }
                      />
                    </div>

                    {caseProduct.memo ? (
                      <p className="mt-4 whitespace-pre-wrap text-sm text-gray-600">
                        {caseProduct.memo}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyText text="まだ商品が追加されていません。" />
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                発注管理
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                発注合計：{formatCurrency(totalOrderAmount)}
              </p>
            </div>

            <Link
              href={`/cases/${item.id}/orders/new`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              ＋ 発注登録
            </Link>
          </div>

          {ordersError ? (
            <ErrorBox
              message={`発注情報取得エラー：${ordersError.message}`}
            />
          ) : orders.length > 0 ? (
            <div className="space-y-3">
              {orders.map((order) => {
                const supplier = getSingleRelation(
                  order.suppliers
                );

                return (
                  <div
                    key={order.id}
                    className="rounded-xl border border-gray-200 p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                      <Info
                        label="発注番号"
                        value={order.order_no}
                      />

                      <Info
                        label="仕入先"
                        value={supplier?.name}
                      />

                      <Info
                        label="発注日"
                        value={formatDate(order.order_date)}
                      />

                      <Info
                        label="納品予定日"
                        value={formatDate(
                          order.expected_delivery_date
                        )}
                      />

                      <Info
                        label="発注金額"
                        value={formatCurrency(
                          order.order_amount
                        )}
                      />

                      <div>
                        <p className="text-xs font-bold text-gray-500">
                          発注状況
                        </p>

                        <div className="mt-2">
                          <OrderStatusBadge
                            status={order.status}
                          />
                        </div>
                      </div>
                    </div>

                    {order.memo ? (
                      <p className="mt-4 whitespace-pre-wrap border-t pt-4 text-sm text-gray-600">
                        {order.memo}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                      <Link
                        href={`/orders/${order.id}`}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
                      >
                        発注詳細
                      </Link>

                      <Link
                        href={`/orders/${order.id}/edit`}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        編集
                      </Link>

                      <Link
                        href={`/orders/${order.id}/print`}
                        target="_blank"
                        className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-700"
                      >
                        発注書PDF
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">
                発注情報はまだ登録されていません。
              </p>

              <Link
                href={`/cases/${item.id}/orders/new`}
                className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
              >
                最初の発注を登録する
              </Link>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                請求管理
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                請求・入金状況をこの案件単位で管理します
              </p>
            </div>

            <Link
              href={`/cases/${item.id}/invoices/new`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
            >
              ＋ 請求登録
            </Link>
          </div>

          <div className="mb-5 grid gap-4 md:grid-cols-3">
            <MiniSummary
              label="請求合計"
              value={formatCurrency(totalInvoiceAmount)}
            />

            <MiniSummary
              label="入金済み"
              value={formatCurrency(totalPaidAmount)}
            />

            <MiniSummary
              label="未入金残高"
              value={formatCurrency(unpaidAmount)}
              alert={unpaidAmount > 0}
            />
          </div>

          {invoicesError ? (
            <ErrorBox
              message={`請求情報取得エラー：${invoicesError.message}`}
            />
          ) : invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const invoicePaidAmount = payments.reduce(
                  (sum, payment) => {
                    if (
                      payment.invoice_id !== invoice.id ||
                      payment.status === "取消"
                    ) {
                      return sum;
                    }

                    return sum + toNumber(payment.payment_amount);
                  },
                  0
                );

                const invoiceRemainingAmount = Math.max(
                  toNumber(invoice.invoice_amount) -
                    invoicePaidAmount,
                  0
                );

                return (
                  <div
                    key={invoice.id}
                    className="rounded-xl border border-gray-200 p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                      <Info
                        label="請求番号"
                        value={invoice.invoice_no}
                      />

                      <Info
                        label="請求日"
                        value={formatDate(invoice.invoice_date)}
                      />

                      <Info
                        label="支払期限"
                        value={formatDate(invoice.due_date)}
                      />

                      <Info
                        label="請求金額"
                        value={formatCurrency(
                          invoice.invoice_amount
                        )}
                      />

                      <Info
                        label="入金残高"
                        value={formatCurrency(
                          invoiceRemainingAmount
                        )}
                      />

                      <div>
                        <p className="text-xs font-bold text-gray-500">
                          ステータス
                        </p>

                        <div className="mt-2">
                          <InvoiceStatusBadge
                            status={invoice.status}
                          />
                        </div>
                      </div>
                    </div>

                    {invoice.memo ? (
                      <p className="mt-4 whitespace-pre-wrap border-t pt-4 text-sm text-gray-600">
                        {invoice.memo}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="rounded-lg border bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
                      >
                        請求詳細
                      </Link>

                      <Link
                        href={`/invoices/${invoice.id}/print`}
                        target="_blank"
                        className="rounded-lg border bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
                      >
                        請求書PDF
                      </Link>

                      {invoiceRemainingAmount > 0 &&
                      invoice.status !== "取消" ? (
                        <Link
                          href={`/invoices/${invoice.id}/payments/new`}
                          className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-700"
                        >
                          ＋ 入金登録
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">
                請求情報はまだ登録されていません。
              </p>

              <Link
                href={`/cases/${item.id}/invoices/new`}
                className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
              >
                最初の請求を登録する
              </Link>
            </div>
          )}

          {paymentsError ? (
            <div className="mt-4">
              <ErrorBox
                message={`入金情報取得エラー：${paymentsError.message}`}
              />
            </div>
          ) : null}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            工事情報
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Info
              label="工事希望日"
              value={formatDate(
                item.construction_desired_date
              )}
            />

            <Info
              label="工事内容"
              value={item.construction_detail}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            ステータス管理
          </h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-bold text-gray-500">
                現在ステータス
              </p>

              <div className="mt-2">
                <StatusSelect
                  caseId={item.id}
                  currentStatus={item.status}
                />
              </div>
            </div>

            <Info
              label="担当部署"
              value={item.department || "営業"}
            />

            <Info
              label="担当者"
              value={item.assigned_user}
            />

            <Info
              label="優先度"
              value={item.priority || "中"}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            備考
          </h2>

          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {item.memo || "備考はありません。"}
          </p>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">
              タスク
            </h2>

            <Link
              href={`/tasks/new?case_id=${item.id}`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              ＋ タスク追加
            </Link>
          </div>

          {tasksError ? (
            <ErrorBox
              message={`タスク取得エラー：${tasksError.message}`}
            />
          ) : tasks.length > 0 ? (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-bold text-gray-900">
                      {task.title || "-"}
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      期限：{formatDate(task.due_date)} / 担当：
                      {task.assigned_user || "-"}
                    </p>
                  </div>

                  <TaskStatusSelect
                    taskId={task.id}
                    currentStatus={task.status}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyText text="この案件に紐づくタスクはまだありません。" />
          )}
        </section>
      </main>
    </>
  );
}

function normalizeCase(
  data: unknown
): CaseDetail & { dealers: Dealer | null } {
  const caseData = data as CaseDetail;

  return {
    ...caseData,
    dealers: getSingleRelation(caseData.dealers),
  };
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

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500">
        {label}
      </p>

      <p className="mt-1 break-words text-sm text-gray-900">
        {value || "-"}
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  suffix,
  decimals = 0,
}: {
  label: string;
  value: number;
  suffix: string;
  decimals?: number;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-xs font-bold text-gray-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-gray-900">
        {value.toLocaleString("ja-JP", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
        {suffix}
      </p>
    </div>
  );
}

function MiniSummary({
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
      className={`rounded-lg p-4 ${
        alert
          ? "border border-red-200 bg-red-50"
          : "bg-gray-50"
      }`}
    >
      <p
        className={`text-xs font-bold ${
          alert ? "text-red-600" : "text-gray-500"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-2 text-xl font-bold ${
          alert ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function OrderStatusBadge({
  status,
}: {
  status: string | null;
}) {
  const currentStatus = status || "未発注";

  const styles: Record<string, string> = {
    未発注: "bg-gray-100 text-gray-700",
    発注済: "bg-blue-100 text-blue-700",
    納期回答待ち: "bg-yellow-100 text-yellow-800",
    納期確定: "bg-purple-100 text-purple-700",
    一部納品: "bg-orange-100 text-orange-700",
    納品済: "bg-green-100 text-green-700",
    取消: "bg-gray-200 text-gray-600",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
        styles[currentStatus] ||
        "bg-gray-100 text-gray-700"
      }`}
    >
      {currentStatus}
    </span>
  );
}

function InvoiceStatusBadge({
  status,
}: {
  status: string | null;
}) {
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
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
        styles[currentStatus] ||
        "bg-gray-100 text-gray-700"
      }`}
    >
      {currentStatus}
    </span>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {message}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p className="text-sm text-gray-500">
      {text}
    </p>
  );
}

function toNumber(
  value: number | string | null | undefined
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : 0;
}

function formatCurrency(
  value: number | string | null | undefined
): string {
  return `${toNumber(value).toLocaleString("ja-JP")}円`;
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ja-JP");
}

function formatDateTime(
  value: string | null | undefined
): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}