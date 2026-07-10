import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Dealer = {
  name: string | null;
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
  status: string | null;
  created_at: string | null;
  cases: CaseData | CaseData[] | null;
};

export default async function InvoicesPage() {
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id,
      case_id,
      invoice_no,
      invoice_date,
      due_date,
      invoice_amount,
      status,
      created_at,
      cases (
        id,
        case_no,
        customer_name,
        dealers (
          name
        )
      )
    `)
    .order("invoice_date", {
      ascending: false,
      nullsFirst: false,
    })
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("請求一覧取得エラー:", error);

    return (
      <>
        <PageHeader />

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              請求データの取得に失敗しました
            </p>

            <p className="mt-2 break-words text-sm text-red-600">
              {error.message}
            </p>
          </div>
        </main>
      </>
    );
  }

  const invoices = (data || []) as unknown as Invoice[];

  const totalInvoiceAmount = invoices.reduce(
    (sum, invoice) => sum + toNumber(invoice.invoice_amount),
    0
  );

  const unpaidInvoices = invoices.filter(
    (invoice) =>
      invoice.status !== "入金済" &&
      invoice.status !== "取消"
  );

  const overdueInvoices = invoices.filter((invoice) => {
    if (
      !invoice.due_date ||
      invoice.status === "入金済" ||
      invoice.status === "取消"
    ) {
      return false;
    }

    return invoice.due_date < getTodayString();
  });

  return (
    <>
      <PageHeader />

      <main className="space-y-6 p-4 md:p-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="請求登録数"
            value={`${invoices.length.toLocaleString("ja-JP")}件`}
          />

          <SummaryCard
            label="請求金額合計"
            value={formatCurrency(totalInvoiceAmount)}
          />

          <SummaryCard
            label="未入金"
            value={`${unpaidInvoices.length.toLocaleString("ja-JP")}件`}
            alert={unpaidInvoices.length > 0}
          />

          <SummaryCard
            label="支払期限超過"
            value={`${overdueInvoices.length.toLocaleString("ja-JP")}件`}
            alert={overdueInvoices.length > 0}
          />
        </section>

        <section className="rounded-xl bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b px-5 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                請求一覧
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                請求情報の確認と入金管理を行います
              </p>
            </div>

            <Link
              href="/cases"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              案件一覧から請求登録
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-5 py-4">
                    請求番号
                  </th>

                  <th className="whitespace-nowrap px-5 py-4">
                    案件番号
                  </th>

                  <th className="whitespace-nowrap px-5 py-4">
                    販売店
                  </th>

                  <th className="whitespace-nowrap px-5 py-4">
                    顧客名
                  </th>

                  <th className="whitespace-nowrap px-5 py-4">
                    請求日
                  </th>

                  <th className="whitespace-nowrap px-5 py-4">
                    支払期限
                  </th>

                  <th className="whitespace-nowrap px-5 py-4 text-right">
                    請求金額
                  </th>

                  <th className="whitespace-nowrap px-5 py-4">
                    ステータス
                  </th>

                  <th className="whitespace-nowrap px-5 py-4 text-center">
                    操作
                  </th>
                </tr>
              </thead>

              <tbody>
                {invoices.length > 0 ? (
                  invoices.map((invoice) => {
                    const caseData = getSingleRelation(invoice.cases);
                    const dealer = getSingleRelation(caseData?.dealers);

                    const isOverdue =
                      !!invoice.due_date &&
                      invoice.due_date < getTodayString() &&
                      invoice.status !== "入金済" &&
                      invoice.status !== "取消";

                    return (
                      <tr
                        key={invoice.id}
                        className={`border-b last:border-b-0 hover:bg-gray-50 ${
                          isOverdue ? "bg-red-50/40" : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {invoice.invoice_no || "請求番号未設定"}
                          </Link>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4">
                          {caseData?.id ? (
                            <Link
                              href={`/cases/${caseData.id}`}
                              className="font-semibold text-blue-600 hover:underline"
                            >
                              {caseData.case_no || "-"}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          {dealer?.name || "-"}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          {caseData?.customer_name || "-"}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          {formatDate(invoice.invoice_date)}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4">
                          <div>
                            <p
                              className={
                                isOverdue
                                  ? "font-bold text-red-700"
                                  : "text-gray-700"
                              }
                            >
                              {formatDate(invoice.due_date)}
                            </p>

                            {isOverdue ? (
                              <p className="mt-1 text-xs font-bold text-red-600">
                                期限超過
                              </p>
                            ) : null}
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-gray-900">
                          {formatCurrency(invoice.invoice_amount)}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4">
                          <StatusBadge status={invoice.status} />
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/invoices/${invoice.id}`}
                              className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
                            >
                              詳細
                            </Link>

                            {invoice.status !== "入金済" &&
                            invoice.status !== "取消" ? (
                              <Link
                                href={`/invoices/${invoice.id}/payments/new`}
                                className="inline-flex rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-gray-700"
                              >
                                入金登録
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-14 text-center"
                    >
                      <p className="text-sm text-gray-500">
                        請求情報はまだ登録されていません。
                      </p>

                      <Link
                        href="/cases"
                        className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
                      >
                        案件一覧を開く
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
        請求管理
      </h1>

      <p className="mt-1 text-sm text-gray-500">
        請求・入金状況を管理します
      </p>
    </header>
  );
}

function SummaryCard({
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
      className={`rounded-xl p-5 shadow-sm ${
        alert
          ? "border border-red-200 bg-red-50"
          : "bg-white"
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
        className={`mt-2 text-2xl font-bold ${
          alert ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string | null;
}) {
  const currentStatus = status || "未請求";

  const statusStyles: Record<string, string> = {
    未請求: "bg-gray-100 text-gray-700",
    請求書作成済: "bg-yellow-100 text-yellow-700",
    請求済: "bg-blue-100 text-blue-700",
    入金待ち: "bg-red-100 text-red-700",
    一部入金: "bg-orange-100 text-orange-700",
    入金済: "bg-green-100 text-green-700",
    取消: "bg-gray-200 text-gray-600",
  };

  const style =
    statusStyles[currentStatus] ||
    "bg-gray-100 text-gray-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${style}`}
    >
      {currentStatus}
    </span>
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

function getTodayString(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}