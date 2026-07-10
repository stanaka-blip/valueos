"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type Dealer = {
  name: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  dealers: Dealer | Dealer[] | null;
};

type InvoiceData = {
  id: string;
  case_id: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: number | string | null;
  status: string | null;
  cases: CaseData | CaseData[] | null;
};

type PaymentData = {
  id: string;
  payment_date: string | null;
  payment_amount: number | string | null;
  status: string | null;
  memo: string | null;
  created_at: string | null;
};

type PaymentForm = {
  payment_date: string;
  payment_amount: string;
  status: string;
  memo: string;
};

const PAYMENT_STATUSES = [
  "入金確認済",
  "入金確認中",
  "取消",
];

export default function NewPaymentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const invoiceId = params?.id || "";

  const [invoice, setInvoice] =
    useState<InvoiceData | null>(null);

  const [payments, setPayments] =
    useState<PaymentData[]>([]);

  const [initialLoading, setInitialLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [loadError, setLoadError] =
    useState("");

  const [submitError, setSubmitError] =
    useState("");

  const [form, setForm] = useState<PaymentForm>({
    payment_date: getTodayString(),
    payment_amount: "",
    status: "入金確認済",
    memo: "",
  });

  useEffect(() => {
    if (!invoiceId) {
      setLoadError("請求IDを取得できませんでした。");
      setInitialLoading(false);
      return;
    }

    if (!isUuid(invoiceId)) {
      setLoadError(
        "請求IDの形式が正しくありません。請求一覧から開き直してください。"
      );
      setInitialLoading(false);
      return;
    }

    async function fetchInitialData() {
      setInitialLoading(true);
      setLoadError("");

      const [
        {
          data: invoiceData,
          error: invoiceError,
        },
        {
          data: paymentData,
          error: paymentError,
        },
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
            cases (
              id,
              case_no,
              customer_name,
              dealers (
                name
              )
            )
          `)
          .eq("id", invoiceId)
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
          .eq("invoice_id", invoiceId)
          .order("payment_date", {
            ascending: false,
            nullsFirst: false,
          })
          .order("created_at", {
            ascending: false,
          }),
      ]);

      if (invoiceError || !invoiceData) {
        console.error(
          "請求情報取得エラー:",
          invoiceError
        );

        setLoadError(
          invoiceError?.message ||
            "請求情報が見つかりませんでした。"
        );

        setInitialLoading(false);
        return;
      }

      if (paymentError) {
        console.error(
          "入金情報取得エラー:",
          paymentError
        );

        setLoadError(
          `入金情報の取得に失敗しました：${paymentError.message}`
        );

        setInitialLoading(false);
        return;
      }

      const normalizedInvoice =
        invoiceData as unknown as InvoiceData;

      const normalizedPayments =
        (paymentData || []) as PaymentData[];

      setInvoice(normalizedInvoice);
      setPayments(normalizedPayments);

      const invoiceAmount = toNumber(
        normalizedInvoice.invoice_amount
      );

      const paidAmount =
        calculatePaidAmount(normalizedPayments);

      const remainingAmount = Math.max(
        invoiceAmount - paidAmount,
        0
      );

      setForm((current) => ({
        ...current,
        payment_amount:
          remainingAmount > 0
            ? String(remainingAmount)
            : "",
      }));

      setInitialLoading(false);
    }

    fetchInitialData();
  }, [invoiceId]);

  const caseData = useMemo(() => {
    return getSingleRelation(invoice?.cases);
  }, [invoice]);

  const dealer = useMemo(() => {
    return getSingleRelation(caseData?.dealers);
  }, [caseData]);

  const invoiceAmount = useMemo(() => {
    return toNumber(invoice?.invoice_amount);
  }, [invoice]);

  const paidAmount = useMemo(() => {
    return calculatePaidAmount(payments);
  }, [payments]);

  const remainingAmount = Math.max(
    invoiceAmount - paidAmount,
    0
  );

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement |
      HTMLTextAreaElement |
      HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!invoice) {
      setSubmitError(
        "請求情報を取得できていません。"
      );
      return;
    }

    setSubmitError("");

    const paymentAmount = toNumber(
      form.payment_amount
    );

    if (!form.payment_date) {
      setSubmitError(
        "入金日を入力してください。"
      );
      return;
    }

    if (paymentAmount <= 0) {
      setSubmitError(
        "入金金額は1円以上で入力してください。"
      );
      return;
    }

    if (remainingAmount <= 0) {
      setSubmitError(
        "この請求はすでに全額入金済みです。"
      );
      return;
    }

    if (
      form.status !== "取消" &&
      paymentAmount > remainingAmount
    ) {
      setSubmitError(
        `入金残高の${formatCurrency(
          remainingAmount
        )}を超えて登録できません。`
      );
      return;
    }

    setSubmitting(true);

    const {
      data: insertedPayment,
      error: paymentError,
    } = await supabase
      .from("payments")
      .insert({
        case_id: invoice.case_id,
        invoice_id: invoice.id,
        payment_date: form.payment_date,
        payment_amount: paymentAmount,
        status: form.status,
        memo: form.memo.trim() || null,
      })
      .select("id")
      .single();

    if (paymentError || !insertedPayment) {
      console.error(
        "入金登録エラー:",
        paymentError
      );

      setSubmitError(
        `入金登録に失敗しました：${
          paymentError?.message ||
          "登録結果を取得できませんでした。"
        }`
      );

      setSubmitting(false);
      return;
    }

    const effectivePaymentAmount =
      form.status === "取消"
        ? 0
        : paymentAmount;

    const newPaidAmount =
      paidAmount + effectivePaymentAmount;

    const newRemainingAmount = Math.max(
      invoiceAmount - newPaidAmount,
      0
    );

    const nextInvoiceStatus =
      newRemainingAmount <= 0
        ? "入金済"
        : newPaidAmount > 0
        ? "一部入金"
        : "入金待ち";

    const nextCaseStatus =
      newRemainingAmount <= 0
        ? "入金済"
        : "入金待ち";

    const {
      error: invoiceUpdateError,
    } = await supabase
      .from("invoices")
      .update({
        status: nextInvoiceStatus,
      })
      .eq("id", invoice.id);

    if (invoiceUpdateError) {
      console.error(
        "請求ステータス更新エラー:",
        invoiceUpdateError
      );

      window.alert(
        `入金は登録されましたが、請求ステータスの更新に失敗しました。\n${invoiceUpdateError.message}`
      );
    }

    if (invoice.case_id) {
      const {
        error: caseUpdateError,
      } = await supabase
        .from("cases")
        .update({
          status: nextCaseStatus,
        })
        .eq("id", invoice.case_id);

      if (caseUpdateError) {
        console.error(
          "案件ステータス更新エラー:",
          caseUpdateError
        );

        window.alert(
          `入金は登録されましたが、案件ステータスの更新に失敗しました。\n${caseUpdateError.message}`
        );
      }
    }

    setSubmitting(false);

    router.push(`/invoices/${invoice.id}`);
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <PageHeader
          title="入金登録"
          description="請求情報を読み込んでいます。"
        />

        <main className="p-4 md:p-8">
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-gray-500">
              読み込み中...
            </p>
          </div>
        </main>
      </>
    );
  }

  if (loadError || !invoice) {
    return (
      <>
        <PageHeader
          title="入金登録"
          description="請求情報を取得できませんでした。"
        />

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              データ取得エラー
            </p>

            <p className="mt-2 break-words text-sm text-red-600">
              {loadError ||
                "請求情報が見つかりません。"}
            </p>

            <Link
              href="/invoices"
              className="mt-5 inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"
            >
              請求一覧へ戻る
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="入金登録"
        description={`請求番号：${
          invoice.invoice_no || "-"
        } / 販売店：${dealer?.name || "-"}`}
      />

      <main className="space-y-6 p-4 md:p-8">
        <div>
          <Link
            href={`/invoices/${invoice.id}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 請求詳細へ戻る
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
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
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            請求情報
          </h2>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Info
              label="請求番号"
              value={invoice.invoice_no}
            />

            <Info
              label="案件番号"
              value={caseData?.case_no}
            />

            <Info
              label="販売店"
              value={dealer?.name}
            />

            <Info
              label="顧客名"
              value={caseData?.customer_name}
            />

            <Info
              label="請求日"
              value={formatDate(
                invoice.invoice_date
              )}
            />

            <Info
              label="支払期限"
              value={formatDate(
                invoice.due_date
              )}
            />

            <Info
              label="請求ステータス"
              value={invoice.status}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-900">
              入金履歴
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              登録件数：{payments.length}件
            </p>
          </div>

          {payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-4">
                    <Info
                      label="入金日"
                      value={formatDate(
                        payment.payment_date
                      )}
                    />

                    <Info
                      label="入金金額"
                      value={formatCurrency(
                        payment.payment_amount
                      )}
                    />

                    <Info
                      label="ステータス"
                      value={payment.status}
                    />

                    <Info
                      label="登録日時"
                      value={formatDateTime(
                        payment.created_at
                      )}
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
            <p className="text-sm text-gray-500">
              入金情報はまだ登録されていません。
            </p>
          )}
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-5 shadow-sm md:p-6"
        >
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            入金内容
          </h2>

          {submitError ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          {remainingAmount <= 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm font-bold text-green-700">
              この請求は全額入金済みです。
            </div>
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  label="入金日"
                  required
                >
                  <input
                    type="date"
                    name="payment_date"
                    value={form.payment_date}
                    onChange={handleChange}
                    className={inputClassName}
                    disabled={submitting}
                  />
                </Field>

                <Field
                  label="入金ステータス"
                  required
                >
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className={inputClassName}
                    disabled={submitting}
                  >
                    {PAYMENT_STATUSES.map(
                      (status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {status}
                        </option>
                      )
                    )}
                  </select>
                </Field>

                <Field
                  label="入金金額"
                  required
                  description={`現在の入金残高：${formatCurrency(
                    remainingAmount
                  )}`}
                >
                  <div className="relative">
                    <input
                      type="number"
                      name="payment_amount"
                      min="1"
                      max={remainingAmount}
                      step="1"
                      value={form.payment_amount}
                      onChange={handleChange}
                      className={`${inputClassName} pr-10 text-right`}
                      disabled={submitting}
                    />

                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                      円
                    </span>
                  </div>
                </Field>

                <div className="md:col-span-2">
                  <Field label="備考">
                    <textarea
                      name="memo"
                      value={form.memo}
                      onChange={handleChange}
                      rows={5}
                      placeholder="振込名義、確認事項、特記事項など"
                      className={inputClassName}
                      disabled={submitting}
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </Link>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {submitting
                    ? "登録しています..."
                    : "入金を登録する"}
                </button>
              </div>
            </>
          )}
        </form>
      </main>
    </>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="border-b bg-white px-4 py-5 md:px-8">
      <h1 className="text-2xl font-bold text-gray-900">
        {title}
      </h1>

      {description ? (
        <p className="mt-1 text-sm text-gray-500">
          {description}
        </p>
      ) : null}
    </header>
  );
}

function Field({
  label,
  required = false,
  description,
  children,
}: {
  label: string;
  required?: boolean;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700">
        {label}

        {required ? (
          <span className="ml-1 text-red-600">
            *
          </span>
        ) : null}
      </span>

      {description ? (
        <span className="mt-1 block text-xs text-gray-500">
          {description}
        </span>
      ) : null}

      <div className="mt-2">{children}</div>
    </label>
  );
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
          ? "border border-orange-200 bg-orange-50"
          : "bg-white"
      }`}
    >
      <p
        className={`text-xs font-bold ${
          alert
            ? "text-orange-600"
            : "text-gray-500"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${
          alert
            ? "text-orange-700"
            : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
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

function calculatePaidAmount(
  payments: PaymentData[]
): number {
  return payments.reduce(
    (total, payment) => {
      if (payment.status === "取消") {
        return total;
      }

      return (
        total +
        toNumber(payment.payment_amount)
      );
    },
    0
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
  return `${toNumber(value).toLocaleString(
    "ja-JP"
  )}円`;
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}