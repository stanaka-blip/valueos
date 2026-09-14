"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import InvoiceLineEditor from "@/components/invoices/InvoiceLineEditor";
import {
  assertInvoiceAmountChangeAllowed,
  assertInvoiceEditable,
  sumConfirmedPaymentsForInvoiceGuard,
} from "@/lib/invoices/invoiceEditGuards";
import {
  buildAutofillCompatFromLineDrafts,
  buildInvoiceLineDraftsFromRows,
  buildInvoiceTotalsFromLines,
  validateAndBuildInvoiceLineInserts,
  type InvoiceLineDraft,
  type InvoiceLineItemRow,
} from "@/lib/invoices/invoiceLineItems";
import { buildInvoiceTaxSnapshotForSave } from "@/lib/invoices/invoiceTaxSnapshot";
import { isActiveInvoiceStatus } from "@/lib/status/activeRecords";
import { supabase } from "@/lib/supabase";

const INVOICE_STATUSES = [
  "未請求",
  "請求書作成済",
  "請求済",
  "入金待ち",
] as const;

type InvoiceForm = {
  invoice_date: string;
  due_date: string;
  invoice_amount: string;
  status: string;
  memo: string;
};

type LoadedInvoice = {
  id: string;
  case_id: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: number | string | null;
  status: string | null;
  memo: string | null;
  cases:
    | {
        id: string;
        case_no: string | null;
        customer_name: string | null;
        dealers: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        id: string;
        case_no: string | null;
        customer_name: string | null;
        dealers: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
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

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const invoiceId = params?.id || "";

  const [invoice, setInvoice] = useState<LoadedInvoice | null>(null);
  const [lineDrafts, setLineDrafts] = useState<InvoiceLineDraft[]>([]);
  const [confirmedPaymentsSum, setConfirmedPaymentsSum] = useState(0);
  const [dealerSettlementStatuses, setDealerSettlementStatuses] = useState<
    string[]
  >([]);
  const [invoiceAmountTouched, setInvoiceAmountTouched] = useState(false);
  const invoiceAmountTouchedRef = useRef(false);

  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState<InvoiceForm>({
    invoice_date: "",
    due_date: "",
    invoice_amount: "",
    status: "請求済",
    memo: "",
  });

  useEffect(() => {
    if (!invoiceId) {
      setLoadError("請求を特定できませんでした。");
      setInitialLoading(false);
      return;
    }

    async function load() {
      setInitialLoading(true);
      setLoadError("");

      const { data: inv, error: invError } = await supabase
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
          memo,
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

      if (invError || !inv) {
        setLoadError(invError?.message || "請求が見つかりません。");
        setInitialLoading(false);
        return;
      }

      const loaded = inv as unknown as LoadedInvoice;
      const editableError = assertInvoiceEditable(loaded.status);
      if (editableError) {
        setLoadError(editableError);
        setInvoice(loaded);
        setInitialLoading(false);
        return;
      }

      setInvoice(loaded);
      setForm({
        invoice_date: toDateInput(loaded.invoice_date),
        due_date: toDateInput(loaded.due_date),
        invoice_amount: String(toNumber(loaded.invoice_amount) || ""),
        status: loaded.status || "請求済",
        memo: loaded.memo || "",
      });

      const { data: lines, error: linesError } = await supabase
        .from("invoice_line_items")
        .select(
          `
          id,
          sort_order,
          line_kind,
          description,
          quantity,
          unit,
          unit_price_ex_tax,
          amount_ex_tax,
          tax_rate,
          memo,
          case_product_id,
          source_product_id,
          source_package_id
        `
        )
        .eq("invoice_id", invoiceId)
        .order("sort_order", { ascending: true });

      if (linesError) {
        setLoadError(`明細の取得に失敗しました：${linesError.message}`);
        setInitialLoading(false);
        return;
      }

      setLineDrafts(
        buildInvoiceLineDraftsFromRows(
          (lines || []) as unknown as InvoiceLineItemRow[]
        )
      );

      const { data: payments } = await supabase
        .from("payments")
        .select("payment_amount, status")
        .eq("invoice_id", invoiceId);

      setConfirmedPaymentsSum(
        sumConfirmedPaymentsForInvoiceGuard(
          (payments || []) as Array<{
            payment_amount: number | null;
            status: string | null;
          }>
        )
      );

      if (loaded.case_id) {
        const { data: settlements } = await supabase
          .from("dealer_settlements")
          .select("status")
          .eq("case_id", loaded.case_id);
        setDealerSettlementStatuses(
          ((settlements || []) as Array<{ status: string | null }>).map(
            (s) => s.status || ""
          )
        );
      }

      setInitialLoading(false);
    }

    void load();
  }, [invoiceId]);

  const lineTotalsPreview = useMemo(() => {
    const totals = buildInvoiceTotalsFromLines(lineDrafts);
    const pricedCount = lineDrafts.filter(
      (d) => d.included && Number.isFinite(Number(d.unit_price_ex_tax))
    ).length;
    return { ...totals, pricedCount };
  }, [lineDrafts]);

  function handleLineDraftsChange(next: InvoiceLineDraft[]) {
    setLineDrafts(next);
    if (!invoiceAmountTouchedRef.current) {
      const totals = buildInvoiceTotalsFromLines(next);
      if (totals.invoiceAmountInclusive > 0) {
        setForm((prev) => ({
          ...prev,
          invoice_amount: String(totals.invoiceAmountInclusive),
        }));
      }
    }
  }

  function handleFormChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    if (name === "invoice_amount") {
      invoiceAmountTouchedRef.current = true;
      setInvoiceAmountTouched(true);
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!invoice) return;

    const editableError = assertInvoiceEditable(invoice.status);
    if (editableError) {
      setSubmitError(editableError);
      return;
    }

    if (!form.invoice_date) {
      setSubmitError("請求日を入力してください。");
      return;
    }

    if (form.due_date && form.due_date < form.invoice_date) {
      setSubmitError("支払期限は請求日以降に設定してください。");
      return;
    }

    const invoiceAmount = toNumber(form.invoice_amount);
    if (invoiceAmount <= 0) {
      setSubmitError("請求金額は1円以上で入力してください。");
      return;
    }

    if (form.status === "取消") {
      setSubmitError(
        "編集画面から取消ステータスには変更できません。取消ボタンを使用してください。"
      );
      return;
    }

    const amountGuard = assertInvoiceAmountChangeAllowed({
      invoiceStatus: invoice.status,
      nextInvoiceAmount: invoiceAmount,
      confirmedPaymentsSum,
      dealerSettlementStatuses,
    });
    if (amountGuard) {
      setSubmitError(amountGuard);
      return;
    }

    const lineValidation = validateAndBuildInvoiceLineInserts(lineDrafts);
    if (!lineValidation.ok) {
      setSubmitError(lineValidation.error_message);
      return;
    }

    const lineAutofill = buildAutofillCompatFromLineDrafts(lineDrafts);
    const taxSnapshot = buildInvoiceTaxSnapshotForSave({
      invoiceAmountTouched: invoiceAmountTouchedRef.current,
      invoiceAmount,
      autofill:
        lineAutofill.invoiceAmountInclusive != null
          ? {
              subtotalExTax: lineAutofill.subtotalExTax,
              tax: lineAutofill.tax,
              invoiceAmountInclusive: lineAutofill.invoiceAmountInclusive,
            }
          : null,
    });

    setSubmitting(true);

    const payload = {
      invoice_id: invoice.id,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      invoice_amount: String(taxSnapshot.invoice_amount),
      subtotal_ex_tax:
        taxSnapshot.subtotal_ex_tax == null
          ? null
          : String(taxSnapshot.subtotal_ex_tax),
      tax_amount:
        taxSnapshot.tax_amount == null ? null : String(taxSnapshot.tax_amount),
      status: form.status,
      memo: form.memo.trim() || null,
      lines: lineValidation.lines.map((line, index) => ({
        sort_order: String(line.sort_order ?? index + 1),
        line_kind: line.line_kind,
        description: line.description,
        quantity: String(line.quantity),
        unit: line.unit,
        unit_price_ex_tax: String(line.unit_price_ex_tax),
        amount_ex_tax: String(line.amount_ex_tax),
        tax_rate: String(line.tax_rate),
        memo: line.memo,
        case_product_id: line.case_product_id,
        source_product_id: line.source_product_id,
        source_package_id: line.source_package_id,
      })),
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "replace_invoice",
      { payload }
    );

    if (rpcError) {
      setSubmitError(`請求の更新に失敗しました：${rpcError.message}`);
      setSubmitting(false);
      return;
    }

    const rpcResult = (rpcData || {}) as {
      ok?: boolean;
      error_message?: string;
    };
    if (rpcResult.ok !== true) {
      setSubmitError(rpcResult.error_message || "請求の更新に失敗しました。");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.push(`/invoices/${invoice.id}`);
    router.refresh();
  }

  const caseData = getSingleRelation(invoice?.cases);
  const dealer = getSingleRelation(caseData?.dealers);
  const cancelled = invoice ? !isActiveInvoiceStatus(invoice.status) : false;

  if (initialLoading) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">請求編集</h1>
        </header>
        <main className="p-4 md:p-8">
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-gray-500">読み込み中...</p>
          </div>
        </main>
      </>
    );
  }

  if (loadError || !invoice || cancelled) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">請求編集</h1>
        </header>
        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">編集できません</p>
            <p className="mt-2 text-sm text-red-600">
              {loadError || "請求が見つかりません。"}
            </p>
            <Link
              href={invoice ? `/invoices/${invoice.id}` : "/invoices"}
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
        <h1 className="text-2xl font-bold text-gray-900">
          請求編集：{invoice.invoice_no || "-"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          案件番号：{caseData?.case_no || "-"} / 販売店：{dealer?.name || "-"}
        </p>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/invoices/${invoice.id}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 請求詳細へ戻る
          </Link>
        </div>

        {confirmedPaymentsSum > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            確認済入金合計：{formatCurrency(confirmedPaymentsSum)}
            （これ未満への減額は保存できません）
          </div>
        ) : null}

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">請求明細</h2>
          <InvoiceLineEditor
            lines={lineDrafts}
            onChange={handleLineDraftsChange}
            disabled={submitting}
          />
          <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-bold text-gray-500">
              明細合計（税抜・請求対象のみ）
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(lineTotalsPreview.subtotalExTax)}
            </p>
            {lineTotalsPreview.pricedCount > 0 ? (
              <p className="text-xs text-gray-500">
                消費税（10%・切捨） {formatCurrency(lineTotalsPreview.tax)}
                {" / "}
                税込見込み{" "}
                {formatCurrency(lineTotalsPreview.invoiceAmountInclusive)}
              </p>
            ) : null}
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-5 shadow-sm md:p-6"
        >
          <h2 className="mb-5 text-lg font-bold text-gray-900">請求情報</h2>

          {submitError ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-gray-500">請求番号</span>
              <p className="mt-1 text-sm font-bold text-gray-900">
                {invoice.invoice_no || "-"}
              </p>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">ステータス</span>
              <select
                name="status"
                value={form.status}
                onChange={handleFormChange}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">請求日</span>
              <input
                type="date"
                name="invoice_date"
                required
                value={form.invoice_date}
                onChange={handleFormChange}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500">支払期限</span>
              <input
                type="date"
                name="due_date"
                value={form.due_date}
                onChange={handleFormChange}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-bold text-gray-500">
                請求額（税込）
                {invoiceAmountTouched ? "（手入力）" : "（明細連動）"}
              </span>
              <input
                type="number"
                name="invoice_amount"
                min={1}
                required
                value={form.invoice_amount}
                onChange={handleFormChange}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-bold text-gray-500">備考</span>
              <textarea
                name="memo"
                rows={4}
                value={form.memo}
                onChange={handleFormChange}
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
              href={`/invoices/${invoice.id}`}
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
