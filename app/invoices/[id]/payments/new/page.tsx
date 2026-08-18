"use client";

import {
  FormEvent,
  use,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  type PaymentMethod,
  type PaymentRecordStatus,
} from "@/lib/payments/constants";
import { buildPaymentInsertPayload } from "@/lib/payments/createPaymentPayload";
import { summarizeInvoicePayments } from "@/lib/payments/invoicePaymentStatus";

type InvoiceData = {
  id: string;
  case_id: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: number | string | null;
  status: string | null;
  cases:
    | {
        id: string;
        case_no: string | null;
        customer_name: string | null;
        dealers:
          | {
              name: string | null;
            }
          | {
              name: string | null;
            }[]
          | null;
      }
    | {
        id: string;
        case_no: string | null;
        customer_name: string | null;
        dealers:
          | {
              name: string | null;
            }
          | {
              name: string | null;
            }[]
          | null;
      }[]
    | null;
};

type PaymentData = {
  id: string;
  payment_date: string | null;
  payment_amount: number | string | null;
  payment_method: string | null;
  payer_name: string | null;
  bank_account: string | null;
  status: string | null;
  memo: string | null;
  created_at: string | null;
};

type PaymentFormState = {
  payment_date: string;
  payment_amount: string;
  payment_method: PaymentMethod;
  payer_name: string;
  bank_account: string;
  status: PaymentRecordStatus;
  memo: string;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(toNumber(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status || "-";
  let className = "bg-gray-100 text-gray-700";
  if (s === "入金確認済") className = "bg-green-100 text-green-700";
  else if (s === "確認待ち" || s === "入金確認中")
    className = "bg-yellow-100 text-yellow-800";
  else if (s === "取消") className = "bg-red-100 text-red-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>
      {s}
    </span>
  );
}

export default function NewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: invoiceId } = use(params);
  const router = useRouter();

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState<PaymentFormState>({
    payment_date: todayString(),
    payment_amount: "",
    payment_method: "銀行振込",
    payer_name: "",
    bank_account: "",
    status: "入金確認済",
    memo: "",
  });

  useEffect(() => {
    if (!invoiceId || !isUuid(invoiceId)) {
      setLoadError("請求IDの形式が正しくありません。");
      setInitialLoading(false);
      return;
    }

    async function fetchInitialData() {
      setInitialLoading(true);
      setLoadError("");

      const invoiceRes = await supabase
        .from("invoices")
        .select(
          `
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
              dealers ( name )
            )
          `
        )
        .eq("id", invoiceId)
        .single();

      if (invoiceRes.error || !invoiceRes.data) {
        setLoadError(invoiceRes.error?.message || "請求情報が見つかりませんでした。");
        setInitialLoading(false);
        return;
      }

      let paymentData: PaymentData[] = [];
      const withCols = await supabase
        .from("payments")
        .select(
          `
            id, payment_date, payment_amount, payment_method,
            payer_name, bank_account, status, memo, created_at
          `
        )
        .eq("invoice_id", invoiceId)
        .order("payment_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (withCols.error) {
        const fallback = await supabase
          .from("payments")
          .select(`id, payment_date, payment_amount, status, memo, created_at`)
          .eq("invoice_id", invoiceId)
          .order("payment_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        if (fallback.error) {
          setLoadError(`入金情報の取得に失敗しました：${fallback.error.message}`);
          setInitialLoading(false);
          return;
        }
        paymentData = (fallback.data || []) as PaymentData[];
      } else {
        paymentData = (withCols.data || []) as PaymentData[];
      }

      const normalizedInvoice = invoiceRes.data as unknown as InvoiceData;
      setInvoice(normalizedInvoice);
      setPayments(paymentData);

      const summary = summarizeInvoicePayments({
        invoiceAmount: toNumber(normalizedInvoice.invoice_amount),
        dueDate: normalizedInvoice.due_date,
        payments: paymentData.map((p) => ({
          paymentAmount: toNumber(p.payment_amount),
          status: p.status,
        })),
      });

      setForm((current) => ({
        ...current,
        payment_amount:
          summary.unpaidAmount > 0 ? String(summary.unpaidAmount) : "",
      }));
      setInitialLoading(false);
    }

    fetchInitialData();
  }, [invoiceId]);

  const caseData = useMemo(() => getSingleRelation(invoice?.cases), [invoice]);
  const dealer = useMemo(() => getSingleRelation(caseData?.dealers), [caseData]);

  const summary = useMemo(
    () =>
      summarizeInvoicePayments({
        invoiceAmount: toNumber(invoice?.invoice_amount),
        dueDate: invoice?.due_date,
        payments: payments.map((p) => ({
          paymentAmount: toNumber(p.payment_amount),
          status: p.status,
        })),
      }),
    [invoice, payments]
  );

  const draftAmount = toNumber(form.payment_amount);
  const projectedPaid =
    form.status === "入金確認済"
      ? summary.confirmedPaidAmount + draftAmount
      : summary.confirmedPaidAmount;
  const projectedOverpay = Math.max(projectedPaid - summary.invoiceAmount, 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    setSubmitting(true);

    // case_id は画面 state を信用せず、invoice_id から再取得して決定する
    if (!invoiceId || !isUuid(invoiceId)) {
      setSubmitError("invoice_id は必須です。");
      setSubmitting(false);
      return;
    }

    const { data: freshInvoice, error: freshError } = await supabase
      .from("invoices")
      .select("id, case_id")
      .eq("id", invoiceId)
      .single();

    if (freshError || !freshInvoice) {
      setSubmitError(
        freshError?.message || "請求情報の再取得に失敗しました。"
      );
      setSubmitting(false);
      return;
    }

    const built = buildPaymentInsertPayload({
      invoice: freshInvoice,
      invoiceId,
      paymentDate: form.payment_date,
      paymentAmount: form.payment_amount,
      paymentMethod: form.payment_method,
      payerName: form.payer_name,
      bankAccount: form.bank_account,
      status: form.status,
      memo: form.memo,
    });

    if (!built.ok) {
      setSubmitError(built.error);
      setSubmitting(false);
      return;
    }

    const extendedPayload = built.payload;
    const basePayload = {
      invoice_id: extendedPayload.invoice_id,
      case_id: extendedPayload.case_id,
      payment_date: extendedPayload.payment_date,
      payment_amount: extendedPayload.payment_amount,
      status: extendedPayload.status,
      memo: extendedPayload.memo,
    };

    let insertError = (
      await supabase.from("payments").insert([extendedPayload]).select("id").single()
    ).error;

    if (insertError) {
      const msg = insertError.message || "";
      if (
        msg.includes("payment_method") ||
        msg.includes("payer_name") ||
        msg.includes("bank_account") ||
        msg.includes("schema cache")
      ) {
        insertError = (
          await supabase.from("payments").insert([basePayload]).select("id").single()
        ).error;
      }
    }

    if (insertError) {
      setSubmitError(`入金登録に失敗しました：${insertError.message}`);
      setSubmitting(false);
      return;
    }

    router.push(`/invoices/${invoiceId}`);
    router.refresh();
  }

  if (initialLoading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-xl bg-white p-6 shadow-sm">読み込み中...</div>
        </div>
      </main>
    );
  }

  if (loadError || !invoice) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            {loadError || "請求情報を取得できませんでした。"}
          </div>
          <div className="mt-4">
            <Link href="/invoices" className="text-sm font-bold text-blue-600 hover:underline">
              請求一覧へ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">入金登録</p>
            <h1 className="text-2xl font-bold text-gray-900">
              請求 {invoice.invoice_no || "-"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              案件 {caseData?.case_no || "-"} / {caseData?.customer_name || "-"} /{" "}
              {dealer?.name || "-"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/queues/collections"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              ← 回収管理へ戻る
            </Link>
            <Link
              href={`/invoices/${invoice.id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              請求詳細へ戻る
            </Link>
          </div>
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="請求額（税込）" value={formatCurrency(summary.invoiceAmount)} />
          <SummaryCard
            label="入金済額"
            value={formatCurrency(summary.confirmedPaidAmount)}
          />
          <SummaryCard
            label="未入金金額"
            value={formatCurrency(summary.unpaidAmount)}
            alert={summary.unpaidAmount > 0}
          />
          <SummaryCard
            label="入金状況"
            value={summary.displayStatus}
            alert={summary.isOverdue}
          />
        </section>

        {summary.warnings.length > 0 ? (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {summary.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl bg-white p-5 shadow-sm md:p-6"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">入金日 *</span>
              <input
                type="date"
                name="payment_date"
                value={form.payment_date}
                onChange={(e) =>
                  setForm((c) => ({ ...c, payment_date: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">入金金額 *</span>
              <input
                type="number"
                name="payment_amount"
                min={1}
                step={1}
                value={form.payment_amount}
                onChange={(e) =>
                  setForm((c) => ({ ...c, payment_amount: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                未入金残高: {formatCurrency(summary.unpaidAmount)}
                （過入金も登録可）
              </p>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">入金方法 *</span>
              <select
                name="payment_method"
                value={form.payment_method}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    payment_method: e.target.value as PaymentMethod,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              >
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">ステータス *</span>
              <select
                name="status"
                value={form.status}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    status: e.target.value as PaymentRecordStatus,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              >
                {PAYMENT_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                「入金確認済」のみ集計・Workflow判定の対象です
              </p>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">振込名義</span>
              <input
                type="text"
                name="payer_name"
                value={form.payer_name}
                onChange={(e) =>
                  setForm((c) => ({ ...c, payer_name: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="例: ヤマダタロウ"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">入金先口座</span>
              <input
                type="text"
                name="bank_account"
                value={form.bank_account}
                onChange={(e) =>
                  setForm((c) => ({ ...c, bank_account: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="例: ○○銀行 普通 1234567"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-gray-700">備考</span>
            <textarea
              name="memo"
              value={form.memo}
              onChange={(e) => setForm((c) => ({ ...c, memo: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {form.status === "入金確認済" && projectedOverpay > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              この登録後、過入金 {formatCurrency(projectedOverpay)} になります（入金済として扱います）。
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "登録中..." : "入金を登録"}
            </button>
            <Link
              href={`/invoices/${invoice.id}`}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </Link>
          </div>
        </form>

        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">既存の入金履歴</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-gray-500">まだ入金はありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="py-2 pr-3">入金日</th>
                    <th className="py-2 pr-3">金額</th>
                    <th className="py-2 pr-3">方法</th>
                    <th className="py-2 pr-3">ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{formatDate(p.payment_date)}</td>
                      <td className="py-2 pr-3">{formatCurrency(p.payment_amount)}</td>
                      <td className="py-2 pr-3">{p.payment_method || "-"}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
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
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p
        className={`mt-2 text-lg font-bold ${
          alert ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
