import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Dealer = {
  name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  site_address: string | null;
  status: string | null;
  dealers: Dealer | Dealer[] | null;
};

type InvoiceDetail = {
  id: string;
  case_id: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: number | string | null;
  status: string | null;
  memo: string | null;
  created_at: string | null;
  cases: CaseData | CaseData[] | null;
};

type Payment = {
  id: string;
  payment_date: string | null;
  payment_amount: number | string | null;
  status: string | null;
  memo: string | null;
  created_at: string | null;
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [
    { data: invoiceData, error: invoiceError },
    { data: paymentData, error: paymentError },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(`
        id,
        case_id,
        invoice_no,
        invoice_date,
        due_date,
        invoice_amount,
        status,
        memo,
        created_at,
        cases (
          id,
          case_no,
          customer_name,
          customer_phone,
          site_address,
          status,
          dealers (
            name,
            contact_name,
            phone,
            email,
            address
          )
        )
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("payments")
      .select(`
        id,
        payment_date,
        payment_amount,
        status,
        memo,
        created_at
      `)
      .eq("invoice_id", id)
      .order("payment_date", {
        ascending: false,
      }),
  ]);

  if (invoiceError || !invoiceData) {
    return (
      <>
        <header className="border-b bg-white px-8 py-5">
          <h1 className="text-2xl font-bold text-gray-900">
            請求詳細
          </h1>
        </header>

        <main className="p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            請求情報取得エラー：
            {invoiceError?.message || "請求情報が見つかりません"}
          </div>

          <Link
            href="/invoices"
            className="mt-5 inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700"
          >
            請求一覧へ戻る
          </Link>
        </main>
      </>
    );
  }

  const invoice = invoiceData as unknown as InvoiceDetail;
  const payments = (paymentData || []) as Payment[];

  const caseData = getSingleRelation(invoice.cases);
  const dealer = getSingleRelation(caseData?.dealers);

  const invoiceAmount = toNumber(invoice.invoice_amount);

  const paidAmount = payments.reduce((sum, payment) => {
    if (payment.status === "取消") {
      return sum;
    }

    return sum + toNumber(payment.payment_amount);
  }, 0);

  const remainingAmount = Math.max(invoiceAmount - paidAmount, 0);

  const today = getTodayString();

  const isOverdue =
    remainingAmount > 0 &&
    !!invoice.due_date &&
    invoice.due_date < today;

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              請求詳細：{invoice.invoice_no || "-"}
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              案件番号：{caseData?.case_no || "-"} / 販売店：
              {dealer?.name || "-"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/invoices"
              className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              一覧へ戻る
            </Link>

            <Link
              href={`/invoices/${invoice.id}/edit`}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              編集
            </Link>

            <Link
              href={`/invoices/${invoice.id}/payments/new`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
            >
              ＋ 入金登録
            </Link>
          </div>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard
            label="請求金額"
            value={formatCurrency(invoiceAmount)}
          />

          <SummaryCard
            label="入金済み"
            value={formatCurrency(paidAmount)}
          />

          <SummaryCard
            label="入金残高"
            value={formatCurrency(remainingAmount)}
            alert={remainingAmount > 0}
          />

          <SummaryCard
            label="支払状況"
            value={
              remainingAmount <= 0
                ? "入金完了"
                : isOverdue
                ? "支払期限超過"
                : "入金待ち"
            }
            alert={isOverdue}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            請求基本情報
          </h2>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Info
              label="請求番号"
              value={invoice.invoice_no}
            />

            <Info
              label="登録日時"
              value={formatDateTime(invoice.created_at)}
            />

            <div>
              <p className="text-xs font-bold text-gray-500">
                ステータス
              </p>

              <div className="mt-2">
                <StatusBadge status={invoice.status} />
              </div>
            </div>

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
              value={formatCurrency(invoice.invoice_amount)}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            案件情報
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold text-gray-500">
                案件番号
              </p>

              {caseData?.id ? (
                <Link
                  href={`/cases/${caseData.id}`}
                  className="mt-1 inline-block text-sm font-bold text-blue-600 hover:underline"
                >
                  {caseData.case_no || "-"}
                </Link>
              ) : (
                <p className="mt-1 text-sm text-gray-900">-</p>
              )}
            </div>

            <Info
              label="案件ステータス"
              value={caseData?.status}
            />

            <Info
              label="顧客名"
              value={caseData?.customer_name}
            />

            <Info
              label="顧客電話番号"
              value={caseData?.customer_phone}
            />

            <Info
              label="施工先住所"
              value={caseData?.site_address}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            請求先情報
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            <Info
              label="販売店名"
              value={dealer?.name}
            />

            <Info
              label="販売店担当者"
              value={dealer?.contact_name}
            />

            <Info
              label="電話番号"
              value={dealer?.phone}
            />

            <Info
              label="メール"
              value={dealer?.email}
            />

            <Info
              label="住所"
              value={dealer?.address}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                入金履歴
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                登録件数：{payments.length}件
              </p>
            </div>

            {remainingAmount > 0 ? (
              <Link
                href={`/invoices/${invoice.id}/payments/new`}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
              >
                ＋ 入金登録
              </Link>
            ) : null}
          </div>

          {paymentError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              入金情報取得エラー：{paymentError.message}
            </div>
          ) : payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-4">
                    <Info
                      label="入金日"
                      value={formatDate(payment.payment_date)}
                    />

                    <Info
                      label="入金金額"
                      value={formatCurrency(payment.payment_amount)}
                    />

                    <Info
                      label="ステータス"
                      value={payment.status}
                    />

                    <Info
                      label="登録日時"
                      value={formatDateTime(payment.created_at)}
                    />
                  </div>

                  {payment.memo ? (
                    <div className="mt-4 border-t pt-4">
                      <p className="text-xs font-bold text-gray-500">
                        備考
                      </p>

                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                        {payment.memo}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">
                入金情報はまだ登録されていません。
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            備考
          </h2>

          <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
            {invoice.memo || "備考はありません。"}
          </p>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                次の操作
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                入金登録・請求情報編集・PDF作成を行います。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {remainingAmount > 0 ? (
                <Link
                  href={`/invoices/${invoice.id}/payments/new`}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
                >
                  ＋ 入金登録
                </Link>
              ) : null}

              <Link
                href={`/invoices/${invoice.id}/edit`}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                請求情報を編集
              </Link>

              <Link
  href={`/invoices/${invoice.id}/print`}
  target="_blank"
  className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
>
  請求書PDF
</Link>
            </div>
          </div>
        </section>
      </main>
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
      className={`rounded-full px-3 py-1 text-xs font-bold ${style}`}
    >
      {currentStatus}
    </span>
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

  const date = new Date(value);

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

function getTodayString(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}