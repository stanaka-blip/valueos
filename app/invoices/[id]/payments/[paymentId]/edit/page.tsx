"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  type PaymentRecordStatus,
} from "@/lib/payments/constants";
import {
  assertPaymentEditable,
  assertPaymentUpdateAllowed,
  isPaymentRecordStatus,
  sumActivePaymentsExcluding,
} from "@/lib/payments/paymentEditGuards";
import { isActivePaymentStatus } from "@/lib/status/activeRecords";
import { supabase } from "@/lib/supabase";

type InvoiceData = {
  id: string;
  invoice_no: string | null;
  invoice_amount: number | string | null;
  status: string | null;
};

type PaymentData = {
  id: string;
  invoice_id: string;
  payment_date: string | null;
  payment_amount: number | string | null;
  payment_method: string | null;
  payer_name: string | null;
  bank_account: string | null;
  status: string | null;
  memo: string | null;
};

type FormState = {
  payment_date: string;
  payment_amount: string;
  payment_method: PaymentMethod;
  payer_name: string;
  bank_account: string;
  status: PaymentRecordStatus;
  memo: string;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: number | string | null | undefined) {
  return `${toNumber(value).toLocaleString("ja-JP")}円`;
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function isPaymentMethod(value: string | null | undefined): value is PaymentMethod {
  return (
    typeof value === "string" &&
    (PAYMENT_METHOD_OPTIONS as readonly string[]).includes(value)
  );
}

export default function EditPaymentPage() {
  const router = useRouter();
  const params = useParams<{ id: string; paymentId: string }>();
  const invoiceId = params?.id || "";
  const paymentId = params?.paymentId || "";

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [siblingPayments, setSiblingPayments] = useState<
    Array<{ id: string; payment_amount: number | null; status: string | null }>
  >([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [form, setForm] = useState<FormState>({
    payment_date: "",
    payment_amount: "",
    payment_method: "銀行振込",
    payer_name: "",
    bank_account: "",
    status: "確認待ち",
    memo: "",
  });

  useEffect(() => {
    if (!invoiceId || !paymentId) {
      setLoadError("入金を特定できませんでした。");
      setInitialLoading(false);
      return;
    }

    async function load() {
      setInitialLoading(true);
      setLoadError("");

      const { data: inv, error: invError } = await supabase
        .from("invoices")
        .select("id, invoice_no, invoice_amount, status")
        .eq("id", invoiceId)
        .single();

      if (invError || !inv) {
        setLoadError(invError?.message || "請求が見つかりません。");
        setInitialLoading(false);
        return;
      }
      setInvoice(inv as InvoiceData);

      const paymentWithCols = await supabase
        .from("payments")
        .select(
          `
          id,
          invoice_id,
          payment_date,
          payment_amount,
          payment_method,
          payer_name,
          bank_account,
          status,
          memo
        `
        )
        .eq("id", paymentId)
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      let pay = paymentWithCols.data as PaymentData | null;
      if (
        paymentWithCols.error &&
        /payment_method|payer_name|bank_account|schema cache/i.test(
          paymentWithCols.error.message
        )
      ) {
        const fallback = await supabase
          .from("payments")
          .select(
            `id, invoice_id, payment_date, payment_amount, status, memo`
          )
          .eq("id", paymentId)
          .eq("invoice_id", invoiceId)
          .maybeSingle();
        if (fallback.error || !fallback.data) {
          setLoadError(
            fallback.error?.message || "入金が見つかりません。"
          );
          setInitialLoading(false);
          return;
        }
        pay = {
          ...(fallback.data as PaymentData),
          payment_method: null,
          payer_name: null,
          bank_account: null,
        };
      } else if (paymentWithCols.error || !pay) {
        setLoadError(
          paymentWithCols.error?.message || "入金が見つかりません。"
        );
        setInitialLoading(false);
        return;
      }

      const editableError = assertPaymentEditable(pay.status);
      if (editableError) {
        setLoadError(editableError);
        setPayment(pay);
        setInitialLoading(false);
        return;
      }

      setPayment(pay);
      setForm({
        payment_date: toDateInput(pay.payment_date),
        payment_amount: String(toNumber(pay.payment_amount) || ""),
        payment_method: isPaymentMethod(pay.payment_method)
          ? pay.payment_method
          : "銀行振込",
        payer_name: pay.payer_name || "",
        bank_account: pay.bank_account || "",
        status: isPaymentRecordStatus(pay.status) ? pay.status : "確認待ち",
        memo: pay.memo || "",
      });

      const { data: siblings } = await supabase
        .from("payments")
        .select("id, payment_amount, status")
        .eq("invoice_id", invoiceId);

      setSiblingPayments(
        (siblings || []) as Array<{
          id: string;
          payment_amount: number | null;
          status: string | null;
        }>
      );

      setInitialLoading(false);
    }

    void load();
  }, [invoiceId, paymentId]);

  const otherActiveSum = useMemo(
    () => sumActivePaymentsExcluding(siblingPayments, paymentId),
    [siblingPayments, paymentId]
  );

  const projectedTotal =
    otherActiveSum + toNumber(form.payment_amount);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!payment || !invoice) return;

    const editableError = assertPaymentEditable(payment.status);
    if (editableError) {
      setSubmitError(editableError);
      return;
    }

    if (!form.payment_date) {
      setSubmitError("入金日を入力してください。");
      return;
    }

    if (form.status === "取消") {
      setSubmitError(
        "編集画面から取消ステータスには変更できません。取消ボタンを使用してください。"
      );
      return;
    }

    const nextAmount = toNumber(form.payment_amount);
    const guardError = assertPaymentUpdateAllowed({
      invoiceAmount: toNumber(invoice.invoice_amount),
      otherActivePaymentsSum: otherActiveSum,
      nextPaymentAmount: nextAmount,
      paymentStatus: payment.status,
    });
    if (guardError) {
      setSubmitError(guardError);
      return;
    }

    setSubmitting(true);

    const updatePayload: Record<string, unknown> = {
      payment_date: form.payment_date,
      payment_amount: nextAmount,
      status: form.status,
      memo: form.memo.trim() || null,
    };

    // 拡張カラムは存在環境でのみ送る（新規登録と同様のフォールバック）
    const withExtras = {
      ...updatePayload,
      payment_method: form.payment_method,
      payer_name: form.payer_name.trim() || null,
      bank_account: form.bank_account.trim() || null,
    };

    let { error: updateError } = await supabase
      .from("payments")
      .update(withExtras)
      .eq("id", paymentId)
      .eq("invoice_id", invoiceId);

    if (
      updateError &&
      /payment_method|payer_name|bank_account|schema cache/i.test(
        updateError.message
      )
    ) {
      const fallback = await supabase
        .from("payments")
        .update(updatePayload)
        .eq("id", paymentId)
        .eq("invoice_id", invoiceId);
      updateError = fallback.error;
    }

    if (updateError) {
      setSubmitError(`入金の更新に失敗しました：${updateError.message}`);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.push(`/invoices/${invoiceId}`);
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">入金編集</h1>
        </header>
        <main className="p-4 md:p-8">
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-gray-500">読み込み中...</p>
          </div>
        </main>
      </>
    );
  }

  const cancelled = payment ? !isActivePaymentStatus(payment.status) : false;

  if (loadError || !payment || !invoice || cancelled) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">入金編集</h1>
        </header>
        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">編集できません</p>
            <p className="mt-2 text-sm text-red-600">
              {loadError || "入金が見つかりません。"}
            </p>
            <Link
              href={`/invoices/${invoiceId}`}
              className="mt-5 inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"
            >
              請求詳細へ戻る
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-2xl font-bold text-gray-900">入金編集</h1>
        <p className="mt-1 text-sm text-gray-500">
          請求番号：{invoice.invoice_no || "-"}
        </p>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/invoices/${invoiceId}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 請求詳細へ戻る
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-500">請求額（税込）</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatCurrency(invoice.invoice_amount)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-500">他の有効入金合計</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatCurrency(otherActiveSum)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-500">保存後の有効入金合計</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatCurrency(projectedTotal)}
            </p>
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-5 shadow-sm md:p-6"
        >
          <h2 className="mb-5 text-lg font-bold text-gray-900">入金情報</h2>

          {submitError ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-gray-500">入金日</span>
              <input
                type="date"
                required
                value={form.payment_date}
                onChange={(e) =>
                  setForm((c) => ({ ...c, payment_date: e.target.value }))
                }
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">入金額</span>
              <input
                type="number"
                min={1}
                required
                value={form.payment_amount}
                onChange={(e) =>
                  setForm((c) => ({ ...c, payment_amount: e.target.value }))
                }
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">入金方法</span>
              <select
                value={form.payment_method}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    payment_method: e.target.value as PaymentMethod,
                  }))
                }
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">ステータス</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    status: e.target.value as PaymentRecordStatus,
                  }))
                }
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="確認待ち">確認待ち</option>
                <option value="入金確認済">入金確認済</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">振込名義</span>
              <input
                type="text"
                value={form.payer_name}
                onChange={(e) =>
                  setForm((c) => ({ ...c, payer_name: e.target.value }))
                }
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">入金先口座</span>
              <input
                type="text"
                value={form.bank_account}
                onChange={(e) =>
                  setForm((c) => ({ ...c, bank_account: e.target.value }))
                }
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-bold text-gray-500">備考</span>
              <textarea
                rows={4}
                value={form.memo}
                onChange={(e) =>
                  setForm((c) => ({ ...c, memo: e.target.value }))
                }
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-gray-700 disabled:opacity-60"
            >
              {submitting ? "保存中..." : "変更を保存"}
            </button>
            <Link
              href={`/invoices/${invoiceId}`}
              className="rounded-lg border bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </main>
    </>
  );
}
