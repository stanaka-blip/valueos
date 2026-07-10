import Link from "next/link";

import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type DealerRelation = {
  name: string | null;
};

type ManufacturerRelation = {
  name: string | null;
};

type ProductRelation = {
  name: string | null;
  manufacturers:
    | ManufacturerRelation
    | ManufacturerRelation[]
    | null;
};

type SupplierRelation = {
  name: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  created_at: string | null;
  customer_name: string | null;
  status: string | null;
  dealer_id: string | null;
  dealers: DealerRelation | DealerRelation[] | null;
};

type CaseProduct = {
  id: string;
  case_id: string | null;
  supplier_id: string | null;
  created_at: string | null;
  sales_price: number | string | null;
  purchase_price: number | string | null;
  gross_profit: number | string | null;
  products: ProductRelation | ProductRelation[] | null;
  suppliers: SupplierRelation | SupplierRelation[] | null;
};

type OrderData = {
  id: string;
  case_id: string | null;
  created_at: string | null;
  order_date: string | null;
  order_amount: number | string | null;
  status: string | null;
  suppliers: SupplierRelation | SupplierRelation[] | null;
};

type InvoiceData = {
  id: string;
  case_id: string | null;
  created_at: string | null;
  invoice_date: string | null;
  invoice_amount: number | string | null;
  due_date: string | null;
  status: string | null;
};

type PaymentData = {
  id: string;
  invoice_id: string | null;
  created_at: string | null;
  payment_date: string | null;
  payment_amount: number | string | null;
  status: string | null;
};

type RankingItem = {
  name: string;
  sales: number;
  profit: number;
  count: number;
};

type ActionItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;

  const requestedMonth =
    resolvedSearchParams.month || getCurrentMonth();

  const selectedMonth =
    requestedMonth === "all" || isValidMonth(requestedMonth)
      ? requestedMonth
      : getCurrentMonth();

  const isAllPeriod = selectedMonth === "all";

  const [
    { data: caseRows, error: casesError },
    { data: productRows, error: productsError },
    { data: orderRows, error: ordersError },
    { data: invoiceRows, error: invoicesError },
    { data: paymentRows, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select(`
        id,
        case_no,
        created_at,
        customer_name,
        status,
        dealer_id,
        dealers (
          name
        )
      `),

    supabase
      .from("case_products")
      .select(`
        id,
        case_id,
        supplier_id,
        created_at,
        sales_price,
        purchase_price,
        gross_profit,
        products (
          name,
          manufacturers (
            name
          )
        ),
        suppliers (
          name
        )
      `),

    supabase
      .from("orders")
      .select(`
        id,
        case_id,
        created_at,
        order_date,
        order_amount,
        status,
        suppliers (
          name
        )
      `),

    supabase
      .from("invoices")
      .select(`
        id,
        case_id,
        created_at,
        invoice_date,
        invoice_amount,
        due_date,
        status
      `),

    supabase
      .from("payments")
      .select(`
        id,
        invoice_id,
        created_at,
        payment_date,
        payment_amount,
        status
      `),
  ]);

  const firstError =
    casesError ||
    productsError ||
    ordersError ||
    invoicesError ||
    paymentsError;

  if (firstError) {
    return (
      <>
        <PageHeader />

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              ダッシュボードの取得に失敗しました
            </p>

            <p className="mt-2 text-sm text-red-600">
              {firstError.message}
            </p>
          </div>
        </main>
      </>
    );
  }

  const allCases = (caseRows || []) as unknown as CaseData[];

  const allCaseProducts =
    (productRows || []) as unknown as CaseProduct[];

  const allOrders =
    (orderRows || []) as unknown as OrderData[];

  const allInvoices =
    (invoiceRows || []) as unknown as InvoiceData[];

  const allPayments =
    (paymentRows || []) as unknown as PaymentData[];

  const cases = isAllPeriod
    ? allCases
    : allCases.filter((item) =>
        isInSelectedMonth(item.created_at, selectedMonth)
      );

  const caseProducts = isAllPeriod
    ? allCaseProducts
    : allCaseProducts.filter((item) =>
        isInSelectedMonth(item.created_at, selectedMonth)
      );

  const orders = isAllPeriod
    ? allOrders
    : allOrders.filter((item) =>
        isInSelectedMonth(
          item.order_date || item.created_at,
          selectedMonth
        )
      );

  const invoices = isAllPeriod
    ? allInvoices
    : allInvoices.filter((item) =>
        isInSelectedMonth(
          item.invoice_date || item.created_at,
          selectedMonth
        )
      );

  const payments = isAllPeriod
    ? allPayments
    : allPayments.filter((item) =>
        isInSelectedMonth(
          item.payment_date || item.created_at,
          selectedMonth
        )
      );

  const totalSales = caseProducts.reduce(
    (sum, item) => sum + toNumber(item.sales_price),
    0
  );

  const totalPurchase = caseProducts.reduce(
    (sum, item) => sum + toNumber(item.purchase_price),
    0
  );

  const totalProfit = caseProducts.reduce(
    (sum, item) => sum + toNumber(item.gross_profit),
    0
  );

  const grossProfitRate =
    totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

  /*
   * 未発注・未請求は、選択月に登録された案件を対象にします。
   * 発注・請求が別月に登録されていても、すでに処理済みなら除外します。
   */
  const allOrderedCaseIds = new Set(
    allOrders
      .filter(
        (order) =>
          order.status !== "未発注" &&
          order.status !== "取消"
      )
      .map((order) => order.case_id)
      .filter((caseId): caseId is string => Boolean(caseId))
  );

  const allInvoicedCaseIds = new Set(
    allInvoices
      .filter(
        (invoice) =>
          invoice.status !== "未請求" &&
          invoice.status !== "取消"
      )
      .map((invoice) => invoice.case_id)
      .filter((caseId): caseId is string => Boolean(caseId))
  );

  const allCaseIdsWithProducts = new Set(
    allCaseProducts
      .map((item) => item.case_id)
      .filter((caseId): caseId is string => Boolean(caseId))
  );

  const unOrderedCases = cases.filter(
    (item) =>
      allCaseIdsWithProducts.has(item.id) &&
      !allOrderedCaseIds.has(item.id) &&
      item.status !== "キャンセル"
  );

  const unInvoicedCases = cases.filter(
    (item) =>
      allCaseIdsWithProducts.has(item.id) &&
      !allInvoicedCaseIds.has(item.id) &&
      item.status !== "キャンセル"
  );

  /*
   * 未入金は、選択月に発行された請求の残高を表示します。
   * 入金は全期間分を参照し、選択月より後に入金された場合も残高へ反映します。
   */
  const validAllPayments = allPayments.filter(
    (payment) => payment.status !== "取消"
  );

  const paidByInvoice = new Map<string, number>();

  validAllPayments.forEach((payment) => {
    if (!payment.invoice_id) {
      return;
    }

    paidByInvoice.set(
      payment.invoice_id,
      (paidByInvoice.get(payment.invoice_id) || 0) +
        toNumber(payment.payment_amount)
    );
  });

  const validInvoices = invoices.filter(
    (invoice) => invoice.status !== "取消"
  );

  const unpaidInvoices = validInvoices.filter((invoice) => {
    const paidAmount = paidByInvoice.get(invoice.id) || 0;

    return paidAmount < toNumber(invoice.invoice_amount);
  });

  const totalInvoiceAmount = validInvoices.reduce(
    (sum, invoice) =>
      sum + toNumber(invoice.invoice_amount),
    0
  );

  const totalPaidAgainstSelectedInvoices =
    validInvoices.reduce((sum, invoice) => {
      return sum + (paidByInvoice.get(invoice.id) || 0);
    }, 0);

  const unpaidAmount = Math.max(
    totalInvoiceAmount - totalPaidAgainstSelectedInvoices,
    0
  );

  const today = getTodayString();

  const overdueInvoices = unpaidInvoices.filter(
    (invoice) =>
      Boolean(invoice.due_date) &&
      String(invoice.due_date) < today
  );

  const dealerRankingMap = new Map<string, RankingItem>();

  const manufacturerRankingMap =
    new Map<string, RankingItem>();

  const supplierRankingMap =
    new Map<string, RankingItem>();

  const allCaseMap = new Map(
    allCases.map((item) => [item.id, item])
  );

  caseProducts.forEach((item) => {
    const sales = toNumber(item.sales_price);
    const profit = toNumber(item.gross_profit);

    const caseData = item.case_id
      ? allCaseMap.get(item.case_id)
      : null;

    const dealer = getSingleRelation(caseData?.dealers);

    const product = getSingleRelation(item.products);

    const manufacturer = getSingleRelation(
      product?.manufacturers
    );

    const supplier = getSingleRelation(item.suppliers);

    addRankingValue(
      dealerRankingMap,
      dealer?.name || "販売店未設定",
      sales,
      profit
    );

    addRankingValue(
      manufacturerRankingMap,
      manufacturer?.name || "メーカー未設定",
      sales,
      profit
    );

    addRankingValue(
      supplierRankingMap,
      supplier?.name || "仕入先未設定",
      sales,
      profit
    );
  });

  const dealerRanking = sortRanking(dealerRankingMap);

  const manufacturerRanking = sortRanking(
    manufacturerRankingMap
  );

  const supplierRanking = sortRanking(
    supplierRankingMap
  );

  const previousMonth = isAllPeriod
    ? null
    : shiftMonth(selectedMonth, -1);

  const nextMonth = isAllPeriod
    ? null
    : shiftMonth(selectedMonth, 1);

  const selectedPeriodLabel = isAllPeriod
    ? "全期間"
    : formatMonthLabel(selectedMonth);

  const unOrderedActionItems: ActionItem[] =
    unOrderedCases.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.case_no || "案件番号未設定",
      subtitle: `${item.customer_name || "顧客名未設定"} / ${
        getSingleRelation(item.dealers)?.name ||
        "販売店未設定"
      }`,
      href: `/cases/${item.id}`,
    }));

  const unInvoicedActionItems: ActionItem[] =
    unInvoicedCases.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.case_no || "案件番号未設定",
      subtitle: `${item.customer_name || "顧客名未設定"} / ${
        getSingleRelation(item.dealers)?.name ||
        "販売店未設定"
      }`,
      href: `/cases/${item.id}`,
    }));

  return (
    <>
      <PageHeader />

      <main className="space-y-8 p-4 md:p-8">
        {/* 期間フィルター */}
        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500">
                集計期間
              </p>

              <h2 className="mt-1 text-2xl font-bold text-gray-900">
                {selectedPeriodLabel}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                売上・粗利・ランキングを選択期間で集計します
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isAllPeriod && previousMonth ? (
                <Link
                  href={`/?month=${previousMonth}`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  ← 前月
                </Link>
              ) : null}

              {!isAllPeriod ? (
                <MonthSelect selectedMonth={selectedMonth} />
              ) : null}

              {!isAllPeriod && nextMonth ? (
                <Link
                  href={`/?month=${nextMonth}`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  翌月 →
                </Link>
              ) : null}

              <Link
                href="/?month=all"
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
                  isAllPeriod
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                全期間
              </Link>

              {isAllPeriod ? (
                <Link
                  href={`/?month=${getCurrentMonth()}`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  今月へ戻る
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {/* 経営サマリー */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              経営サマリー
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {selectedPeriodLabel}の売上・利益・対応状況
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DashboardCard
              label="売上"
              value={formatCurrency(totalSales)}
              description="案件商品販売合計"
              href="/cases"
            />

            <DashboardCard
              label="実粗利"
              value={formatCurrency(totalProfit)}
              description={`仕入合計 ${formatCurrency(
                totalPurchase
              )}`}
              href="/cases"
            />

            <DashboardCard
              label="粗利率"
              value={`${grossProfitRate.toFixed(1)}%`}
              description="実粗利 ÷ 売上"
              href="/cases"
            />

            <DashboardCard
              label="未請求"
              value={`${unInvoicedCases.length}件`}
              description="商品登録済み・請求未登録"
              href="/cases"
              alert={unInvoicedCases.length > 0}
            />

            <DashboardCard
              label="未入金"
              value={formatCurrency(unpaidAmount)}
              description={`${unpaidInvoices.length}件 / 期限超過 ${overdueInvoices.length}件`}
              href="/invoices"
              alert={unpaidAmount > 0}
            />

            <DashboardCard
              label="未発注"
              value={`${unOrderedCases.length}件`}
              description="商品登録済み・発注未登録"
              href="/cases"
              alert={unOrderedCases.length > 0}
            />
          </div>
        </section>

        {/* ランキング */}
        <section className="grid gap-6 xl:grid-cols-3">
          <RankingCard
            title="販売店ランキング"
            description={`${selectedPeriodLabel}・販売金額順`}
            items={dealerRanking}
          />

          <RankingCard
            title="メーカーランキング"
            description={`${selectedPeriodLabel}・販売金額順`}
            items={manufacturerRanking}
          />

          <RankingCard
            title="仕入先ランキング"
            description={`${selectedPeriodLabel}・販売金額順`}
            items={supplierRanking}
          />
        </section>

        {/* 対応案件 */}
        <section className="grid gap-6 xl:grid-cols-2">
          <ActionList
            title="未発注案件"
            description={`${unOrderedCases.length}件の確認が必要です`}
            emptyText="未発注案件はありません。"
            items={unOrderedActionItems}
          />

          <ActionList
            title="未請求案件"
            description={`${unInvoicedCases.length}件の確認が必要です`}
            emptyText="未請求案件はありません。"
            items={unInvoicedActionItems}
          />
        </section>

        {/* 次の操作 */}
        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                次に確認すること
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                未発注・未請求・未入金を優先して処理してください
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/cases"
                className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-700"
              >
                案件管理
              </Link>

              <Link
                href="/invoices"
                className="rounded-lg border bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                請求管理
              </Link>

              <Link
                href="/tasks"
                className="rounded-lg border bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                タスク管理
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function PageHeader() {
  return (
    <header className="border-b bg-white px-4 py-5 md:px-8">
      <h1 className="text-2xl font-bold text-gray-900">
        経営ダッシュボード
      </h1>

      <p className="mt-1 text-sm text-gray-500">
        ValueOS 卸売事業の経営状況
      </p>
    </header>
  );
}

function MonthSelect({
  selectedMonth,
}: {
  selectedMonth: string;
}) {
  const months = createMonthOptions();

  return (
    <div className="flex flex-wrap gap-2">
      {months.map((month) => {
        const active = month.value === selectedMonth;

        return (
          <Link
            key={month.value}
            href={`/?month=${month.value}`}
            className={`rounded-lg px-3 py-2 text-sm font-bold ${
              active
                ? "bg-gray-900 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {month.label}
          </Link>
        );
      })}
    </div>
  );
}

function DashboardCard({
  label,
  value,
  description,
  href,
  alert = false,
}: {
  label: string;
  value: string;
  description: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        alert
          ? "border border-red-200 bg-red-50"
          : "bg-white"
      }`}
    >
      <p
        className={`text-sm font-bold ${
          alert ? "text-red-600" : "text-gray-500"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-3 text-3xl font-bold ${
          alert ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>

      <p
        className={`mt-2 text-xs ${
          alert ? "text-red-600" : "text-gray-500"
        }`}
      >
        {description}
      </p>
    </Link>
  );
}

function RankingCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: RankingItem[];
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-lg font-bold text-gray-900">
        {title}
      </h2>

      <p className="mt-1 text-sm text-gray-500">
        {description}
      </p>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.slice(0, 5).map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                  {index + 1}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {item.name}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {item.count}件 / 粗利{" "}
                    {formatCurrency(item.profit)}
                  </p>
                </div>
              </div>

              <p className="shrink-0 text-sm font-bold text-gray-900">
                {formatCurrency(item.sales)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500">
            集計対象データがありません。
          </p>
        )}
      </div>
    </div>
  );
}

function ActionList({
  title,
  description,
  emptyText,
  items,
}: {
  title: string;
  description: string;
  emptyText: string;
  items: ActionItem[];
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-lg font-bold text-gray-900">
        {title}
      </h2>

      <p className="mt-1 text-sm text-gray-500">
        {description}
      </p>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center justify-between gap-4 rounded-lg border p-4 hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-bold text-blue-600">
                  {item.title}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  {item.subtitle}
                </p>
              </div>

              <span className="text-sm font-bold text-gray-400">
                →
              </span>
            </Link>
          ))
        ) : (
          <p className="text-sm text-gray-500">
            {emptyText}
          </p>
        )}
      </div>
    </div>
  );
}

function addRankingValue(
  map: Map<string, RankingItem>,
  name: string,
  sales: number,
  profit: number
) {
  const current = map.get(name);

  if (current) {
    current.sales += sales;
    current.profit += profit;
    current.count += 1;
    return;
  }

  map.set(name, {
    name,
    sales,
    profit,
    count: 1,
  });
}

function sortRanking(
  map: Map<string, RankingItem>
): RankingItem[] {
  return Array.from(map.values()).sort(
    (a, b) => b.sales - a.sales
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

function getCurrentMonth(): string {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  return `${year}-${month}`;
}

function getTodayString(): string {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isInSelectedMonth(
  value: string | null | undefined,
  selectedMonth: string
): boolean {
  if (!value) {
    return false;
  }

  return value.slice(0, 7) === selectedMonth;
}

function shiftMonth(
  monthValue: string,
  amount: number
): string {
  const [year, month] = monthValue
    .split("-")
    .map(Number);

  const date = new Date(year, month - 1 + amount, 1);

  const shiftedYear = date.getFullYear();

  const shiftedMonth = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  return `${shiftedYear}-${shiftedMonth}`;
}

function formatMonthLabel(
  monthValue: string
): string {
  const [year, month] = monthValue.split("-");

  return `${year}年${Number(month)}月`;
}

function createMonthOptions(): {
  value: string;
  label: string;
}[] {
  const currentMonth = getCurrentMonth();

  const options: {
    value: string;
    label: string;
  }[] = [];

  for (let index = -2; index <= 2; index += 1) {
    const value = shiftMonth(currentMonth, index);

    options.push({
      value,
      label:
        index === 0
          ? "今月"
          : formatMonthLabel(value),
    });
  }

  return options;
}