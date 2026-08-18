"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { fetchCaseWorkflowForCasePage } from "@/app/cases/[id]/fetchCaseWorkflow";
import InvoiceLineEditor from "@/components/invoices/InvoiceLineEditor";
import {
  UNSET_PRICE_WARNING,
  buildInvoiceAmountAutofill,
  resolveLineFromLookup,
  type InvoiceAmountAutofillResult,
  type InvoiceLineForAutofill,
  type ResolvedInvoiceLinePrice,
} from "@/lib/invoices/invoiceAmountAutofill";
import {
  buildAutofillCompatFromLineDrafts,
  buildInvoiceLineDraftsFromCaseSeeds,
  buildInvoiceTotalsFromLines,
  validateAndBuildInvoiceLineInserts,
  type InvoiceLineDraft,
} from "@/lib/invoices/invoiceLineItems";
import { buildInvoiceTaxSnapshotForSave } from "@/lib/invoices/invoiceTaxSnapshot";
import { resolveNewInvoiceDueDate } from "@/lib/invoices/resolveNewInvoiceDueDate";
import type { PriceTargetType } from "@/lib/prices/targetType";
import { fetchActiveSalesPrice } from "@/lib/salesPrices";
import { supabase } from "@/lib/supabase";
import type { WorkflowResult } from "@/lib/workflow";

/** 決済区分未設定（WorkflowEngine の固定文言と一致） */
function isSettlementTypeUnset(workflow: WorkflowResult | null): boolean {
  if (!workflow) return false;
  return (
    workflow.ruleKey === null &&
    workflow.warnings.includes("決済区分が未設定です")
  );
}

type Dealer = {
  name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  dealer_id: string | null;
  order_received_date: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  site_address: string | null;
  status: string | null;
  dealers: Dealer | Dealer[] | null;
};

type ProductRelation = {
  name: string | null;
  model_no: string | null;
  unit: string | null;
};

type PackageRelation = {
  name: string | null;
};

type CaseProduct = {
  id: string;
  line_type: string | null;
  product_id: string | null;
  package_id: string | null;
  quantity: number | null;
  products: ProductRelation | ProductRelation[] | null;
  packages: PackageRelation | PackageRelation[] | null;
};

type InvoiceForm = {
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: string;
  status: string;
  memo: string;
};

const INVOICE_STATUSES = [
  "未請求",
  "請求書作成済",
  "請求済",
  "入金待ち",
];

export default function NewInvoicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  /*
   * URLの[id]には本来UUIDが入ります。
   * 万が一VE-XXXXの案件番号が入っても、
   * 後ほどcase_noから本物のUUIDを取得します。
   */
  const routeCaseIdentifier = params?.id || "";
  const initialRouteError = routeCaseIdentifier
    ? ""
    : "案件を特定できませんでした。";

  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [caseProducts, setCaseProducts] = useState<CaseProduct[]>([]);
  const [lineDrafts, setLineDrafts] = useState<InvoiceLineDraft[]>([]);
  const [autofill, setAutofill] =
    useState<InvoiceAmountAutofillResult | null>(null);
  /** 請求金額をユーザーが手動変更したら true。再計算で上書きしない */
  const [invoiceAmountTouched, setInvoiceAmountTouched] = useState(false);
  const invoiceAmountTouchedRef = useRef(false);
  const dueDateTouchedRef = useRef(false);

  const [initialLoading, setInitialLoading] = useState(!initialRouteError);
  const [submitting, setSubmitting] = useState(false);

  const [loadError, setLoadError] = useState(initialRouteError);
  const [submitError, setSubmitError] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowResult | null>(null);
  const [workflowLoadError, setWorkflowLoadError] = useState("");

  const [form, setForm] = useState<InvoiceForm>({
    invoice_no: "",
    invoice_date: getTodayString(),
    due_date: "",
    invoice_amount: "",
    status: "請求済",
    memo: "",
  });

  useEffect(() => {
    if (!routeCaseIdentifier) {
      return;
    }

    async function fetchInitialData() {
      setInitialLoading(true);
      setLoadError("");

      /*
       * URLがUUIDならcases.idで検索。
       * VE-XXXXなどならcases.case_noで検索します。
       */
      let caseQuery = supabase
        .from("cases")
        .select(`
          id,
          case_no,
          dealer_id,
          order_received_date,
          customer_name,
          customer_phone,
          site_address,
          status,
          dealers (
            name,
            contact_name,
            phone,
            email
          )
        `);

      if (isUuid(routeCaseIdentifier)) {
        caseQuery = caseQuery.eq("id", routeCaseIdentifier);
      } else {
        caseQuery = caseQuery.eq("case_no", routeCaseIdentifier);
      }

      const { data: rawCaseData, error: caseError } =
        await caseQuery.maybeSingle();

      if (caseError || !rawCaseData) {
        console.error("案件情報取得エラー:", caseError);

        setLoadError(
          caseError?.message ||
            "案件が見つかりません。案件一覧から開き直してください。"
        );
        setInitialLoading(false);
        return;
      }

      const normalizedCase =
        rawCaseData as unknown as CaseData;

      setCaseData(normalizedCase);

      /*
       * ここからはURLの値ではなく、
       * DBから取得した本物のUUIDを必ず使用します。
       */
      const resolvedCaseId = normalizedCase.id;

      const { data: rawProductData, error: productError } =
        await supabase
          .from("case_products")
          .select(`
            id,
            line_type,
            product_id,
            package_id,
            quantity,
            products (
              name,
              model_no,
              unit
            ),
            packages (
              name
            )
          `)
          .eq("case_id", resolvedCaseId)
          .order("created_at", {
            ascending: true,
          });

      if (productError) {
        console.error("案件商品取得エラー:", productError);

        setLoadError(
          `案件商品の取得に失敗しました：${productError.message}`
        );
        setInitialLoading(false);
        return;
      }

      const normalizedProducts =
        (rawProductData || []) as unknown as CaseProduct[];

      setCaseProducts(normalizedProducts);

      const asOfDate =
        (normalizedCase.order_received_date || "").trim() ||
        getTodayString();
      const dealerId = (normalizedCase.dealer_id || "").trim();

      const resolvedLines = await resolveSalesPricesForCaseProducts({
        products: normalizedProducts,
        dealerId,
        asOfDate,
      });
      const autofillResult = buildInvoiceAmountAutofill(resolvedLines);
      setAutofill(autofillResult);

      const draftSeeds = normalizedProducts.map((caseProduct) => {
        const lineType = normalizeCaseLineType(caseProduct.line_type);
        const product = getSingleRelation(caseProduct.products);
        const pkg = getSingleRelation(caseProduct.packages);
        const priced = resolvedLines.find((line) => line.id === caseProduct.id);
        return {
          caseProductId: caseProduct.id,
          lineType,
          productId: caseProduct.product_id,
          packageId: caseProduct.package_id,
          description:
            lineType === "PACKAGE"
              ? pkg?.name || "パッケージ"
              : product?.name || product?.model_no || "商品",
          quantity: toNumber(caseProduct.quantity),
          unit:
            lineType === "PACKAGE"
              ? "式"
              : product?.unit || "台",
          unitPriceExTax:
            priced?.status === "priced" ? priced.unitPriceExTax : null,
        };
      });
      const initialDrafts = buildInvoiceLineDraftsFromCaseSeeds(draftSeeds);
      setLineDrafts(initialDrafts);

      const lineTotals = buildAutofillCompatFromLineDrafts(initialDrafts);
      const suggestedInclusive =
        lineTotals.invoiceAmountInclusive != null
          ? String(lineTotals.invoiceAmountInclusive)
          : autofillResult.invoiceAmountInclusive != null
            ? String(autofillResult.invoiceAmountInclusive)
            : "";

      const workflowLoad =
        await fetchCaseWorkflowForCasePage(resolvedCaseId);
      if (workflowLoad.ok) {
        setWorkflow(workflowLoad.result);
        setWorkflowLoadError("");
        setForm((current) => ({
          ...current,
          invoice_no:
            current.invoice_no ||
            generateInvoiceNumber(normalizedCase.case_no),
          invoice_amount: invoiceAmountTouchedRef.current
            ? current.invoice_amount
            : suggestedInclusive || current.invoice_amount,
          due_date: resolveNewInvoiceDueDate({
            userTouched: dueDateTouchedRef.current,
            currentDueDate: current.due_date,
            workflowPaymentDueDate: workflowLoad.result.paymentDueDate,
            fallbackDueDate: getDefaultDueDate(),
          }),
        }));
      } else {
        setWorkflow(null);
        setWorkflowLoadError(
          workflowLoad.error_message || "決済条件の取得に失敗しました"
        );
        setForm((current) => ({
          ...current,
          invoice_no:
            current.invoice_no ||
            generateInvoiceNumber(normalizedCase.case_no),
          invoice_amount: invoiceAmountTouchedRef.current
            ? current.invoice_amount
            : suggestedInclusive || current.invoice_amount,
          due_date: resolveNewInvoiceDueDate({
            userTouched: dueDateTouchedRef.current,
            currentDueDate: current.due_date,
            workflowPaymentDueDate: null,
            fallbackDueDate: getDefaultDueDate(),
          }),
        }));
      }

      setInitialLoading(false);
    }

    fetchInitialData();
  }, [routeCaseIdentifier]);

  const dealer = useMemo(() => {
    return getSingleRelation(caseData?.dealers);
  }, [caseData]);

  const settlementUnset = isSettlementTypeUnset(workflow);
  const invoiceBlockedBySettlementRule = Boolean(
    workflow && !workflow.canInvoice && !settlementUnset
  );

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement |
      HTMLTextAreaElement |
      HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;

    if (name === "invoice_amount") {
      invoiceAmountTouchedRef.current = true;
      setInvoiceAmountTouched(true);
    }
    if (name === "due_date") {
      dueDateTouchedRef.current = true;
    }

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleLineDraftsChange(next: InvoiceLineDraft[]) {
    setLineDrafts(next);
    if (invoiceAmountTouchedRef.current) {
      return;
    }
    const totals = buildInvoiceTotalsFromLines(next);
    if (totals.invoiceAmountInclusive > 0) {
      setForm((current) => ({
        ...current,
        invoice_amount: String(totals.invoiceAmountInclusive),
      }));
    } else {
      setForm((current) => ({
        ...current,
        invoice_amount: "",
      }));
    }
  }

  const lineTotalsPreview = useMemo(
    () => buildAutofillCompatFromLineDrafts(lineDrafts),
    [lineDrafts]
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!caseData) {
      setSubmitError(
        "案件情報を取得できていません。画面を更新してください。"
      );
      return;
    }

    setSubmitError("");

    const latestWorkflow = await fetchCaseWorkflowForCasePage(caseData.id);
    if (!latestWorkflow.ok) {
      setWorkflow(null);
      setWorkflowLoadError(
        latestWorkflow.error_message || "決済条件の取得に失敗しました"
      );
      setSubmitError(
        latestWorkflow.error_message ||
          "決済条件を確認できませんでした。画面を更新して再度お試しください。"
      );
      return;
    }
    setWorkflow(latestWorkflow.result);
    setWorkflowLoadError("");
    if (!latestWorkflow.result.canInvoice) {
      if (!isSettlementTypeUnset(latestWorkflow.result)) {
        setSubmitError(
          latestWorkflow.result.warnings[0] ||
            "現在の決済区分ルールでは請求できません。"
        );
      }
      return;
    }

    const invoiceAmount = toNumber(
      form.invoice_amount
    );

    if (!form.invoice_no.trim()) {
      setSubmitError("請求番号を入力してください。");
      return;
    }

    if (!form.invoice_date) {
      setSubmitError("請求日を入力してください。");
      return;
    }

    if (
      form.due_date &&
      form.due_date < form.invoice_date
    ) {
      setSubmitError(
        "支払期限は請求日以降に設定してください。"
      );
      return;
    }

    if (invoiceAmount <= 0) {
      setSubmitError(
        "請求金額は1円以上で入力してください。"
      );
      return;
    }

    const lineValidation = validateAndBuildInvoiceLineInserts(lineDrafts);
    if (!lineValidation.ok) {
      setSubmitError(lineValidation.error_message);
      return;
    }

    setSubmitting(true);

    /*
     * 同じ請求番号が存在しないか確認します。
     */
    const {
      data: duplicateInvoice,
      error: duplicateError,
    } = await supabase
      .from("invoices")
      .select("id")
      .eq("invoice_no", form.invoice_no.trim())
      .maybeSingle();

    if (duplicateError) {
      console.error(
        "請求番号重複確認エラー:",
        duplicateError
      );

      setSubmitError(
        `請求番号の確認に失敗しました：${duplicateError.message}`
      );
      setSubmitting(false);
      return;
    }

    if (duplicateInvoice) {
      setSubmitError(
        "同じ請求番号がすでに登録されています。別の請求番号を入力してください。"
      );
      setSubmitting(false);
      return;
    }

    /*
     * caseData.idはSupabaseから取得した本物のUUIDです。
     * 税スナップショット:
     * - 明細合計から自動入力のまま未編集 → subtotal_ex_tax / tax_amount / invoice_amount を保存
     * - 手入力 → invoice_amount のみ（税抜・税額は逆算せず NULL）
     */
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
          : autofill,
    });

    const { data: insertedInvoice, error: invoiceError } =
      await supabase
        .from("invoices")
        .insert({
          case_id: caseData.id,
          invoice_no: form.invoice_no.trim(),
          invoice_date: form.invoice_date,
          due_date: form.due_date || null,
          invoice_amount: taxSnapshot.invoice_amount,
          subtotal_ex_tax: taxSnapshot.subtotal_ex_tax,
          tax_amount: taxSnapshot.tax_amount,
          status: form.status,
          memo: form.memo.trim() || null,
        })
        .select("id")
        .single();

    if (invoiceError || !insertedInvoice) {
      console.error("請求登録エラー:", invoiceError);

      setSubmitError(
        `請求登録に失敗しました：${
          invoiceError?.message ||
          "登録結果を取得できませんでした"
        }`
      );
      setSubmitting(false);
      return;
    }

    const lineInserts = lineValidation.lines.map((line) => ({
      ...line,
      invoice_id: insertedInvoice.id,
    }));

    const { error: lineItemsError } = await supabase
      .from("invoice_line_items")
      .insert(lineInserts);

    if (lineItemsError) {
      console.error("請求明細登録エラー:", lineItemsError);
      // ヘッダのみ残ると明細なし請求になるため、補償削除する
      const { error: rollbackError } = await supabase
        .from("invoices")
        .delete()
        .eq("id", insertedInvoice.id);
      if (rollbackError) {
        console.error("請求ヘッダ補償削除エラー:", rollbackError);
        setSubmitError(
          `明細の保存に失敗し、請求ヘッダの取消にも失敗しました。請求詳細を確認してください。\n明細: ${lineItemsError.message}\n取消: ${rollbackError.message}`
        );
      } else {
        setSubmitError(
          `明細の保存に失敗したため、請求は登録されていません：${lineItemsError.message}`
        );
      }
      setSubmitting(false);
      return;
    }

    const nextCaseStatus =
      getCaseStatusFromInvoiceStatus(form.status);

    if (nextCaseStatus) {
      const { error: caseStatusError } =
        await supabase
          .from("cases")
          .update({
            status: nextCaseStatus,
          })
          .eq("id", caseData.id);

      if (caseStatusError) {
        console.error(
          "案件ステータス更新エラー:",
          caseStatusError
        );

        window.alert(
          `請求は登録されましたが、案件ステータスの更新に失敗しました。\n${caseStatusError.message}`
        );
      }
    }

    setSubmitting(false);

    /*
     * 登録後は請求詳細画面へ移動します。
     */
    router.push(`/invoices/${insertedInvoice.id}`);
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <PageHeader
          title="請求登録"
          description="案件情報を読み込んでいます。"
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

  if (loadError || !caseData) {
    return (
      <>
        <PageHeader
          title="請求登録"
          description="案件情報を取得できませんでした。"
        />

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              案件取得エラー
            </p>

            <p className="mt-2 break-words text-sm text-red-600">
              {loadError ||
                "案件が見つかりませんでした。"}
            </p>

            <Link
              href="/cases"
              className="mt-5 inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"
            >
              案件一覧へ戻る
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="請求登録"
        description={`案件番号：${
          caseData.case_no || "-"
        } / 請求先販売店：${dealer?.name || "-"}`}
      />

      <main className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/queues/collections"
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 回収管理へ戻る
          </Link>
          <Link
            href={`/cases/${caseData.id}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 案件詳細へ戻る
          </Link>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            請求対象案件
          </h2>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Info
              label="案件番号"
              value={caseData.case_no}
            />

            <Info
              label="請求先販売店"
              value={dealer?.name}
            />

            <Info
              label="販売店担当者"
              value={dealer?.contact_name}
            />

            <Info
              label="顧客名"
              value={caseData.customer_name}
            />

            <Info
              label="顧客電話番号"
              value={caseData.customer_phone}
            />

            <Info
              label="現在ステータス"
              value={caseData.status}
            />

            <Info
              label="施工先住所"
              value={caseData.site_address}
              className="md:col-span-2"
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            請求明細
          </h2>

          {autofill?.hasUnsetPrices ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {UNSET_PRICE_WARNING}
            </div>
          ) : null}

          {caseProducts.length === 0 && lineDrafts.length === 0 ? (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              この案件には商品・パッケージが登録されていません。
              任意明細を追加するか、請求金額を手入力してください。
            </div>
          ) : null}

          <InvoiceLineEditor
            lines={lineDrafts}
            onChange={handleLineDraftsChange}
            disabled={submitting}
          />

          <div className="mt-4 rounded-lg bg-gray-50 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-500">
              明細合計（税抜・請求対象のみ）
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(lineTotalsPreview.subtotalExTax)}
            </p>
            {lineTotalsPreview.pricedCount > 0 ? (
              <p className="text-xs text-gray-500">
                消費税（10%・切捨）{" "}
                {formatCurrency(lineTotalsPreview.tax)}
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
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            請求情報
          </h2>

          {workflowLoadError ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              決済条件の取得に失敗しました：{workflowLoadError}
              （未設定とは限りません。画面を更新して再度お試しください。）
            </div>
          ) : null}

          {!workflowLoadError && settlementUnset ? (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              決済区分が未設定です。請求するには決済条件を設定してください。
            </div>
          ) : null}

          {!workflowLoadError && invoiceBlockedBySettlementRule ? (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">請求できません</p>
              <p className="mt-1">
                担当: {workflow?.assignee} / 次のアクション:{" "}
                {workflow?.nextAction}
              </p>
              {workflow && workflow.warnings.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {workflow.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {workflow?.billingClosingDate || workflow?.paymentDueDate ? (
            <div className="mb-5 rounded-lg border border-gray-200 bg-[#f7f7f5] p-4 text-sm text-gray-700">
              <p>
                売掛 締日: {workflow.billingClosingDate || "—"} / 入金予定日:{" "}
                {workflow.paymentDueDate || "—"}
              </p>
            </div>
          ) : null}

          {submitError ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="請求番号"
              required
            >
              <input
                type="text"
                name="invoice_no"
                value={form.invoice_no}
                onChange={handleChange}
                placeholder="例：INV-2026-000001"
                className={inputClassName}
                disabled={submitting}
              />
            </Field>

            <Field
              label="請求ステータス"
              required
            >
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className={inputClassName}
                disabled={submitting}
              >
                {INVOICE_STATUSES.map((status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="請求日"
              required
            >
              <input
                type="date"
                name="invoice_date"
                value={form.invoice_date}
                onChange={handleChange}
                className={inputClassName}
                disabled={submitting}
              />
            </Field>

            <Field label="支払期限">
              <input
                type="date"
                name="due_date"
                value={form.due_date}
                onChange={handleChange}
                className={inputClassName}
                disabled={submitting}
              />
            </Field>

            <Field
              label="請求金額"
              required
              description={
                lineTotalsPreview.invoiceAmountInclusive != null &&
                !invoiceAmountTouched
                  ? `請求明細の税抜合計 ${formatCurrency(
                      lineTotalsPreview.subtotalExTax
                    )} に消費税（切捨）を加算した税込 ${formatCurrency(
                      lineTotalsPreview.invoiceAmountInclusive
                    )} を初期入力しています。明細変更で再計算されます。請求金額を直接変更後は自動では上書きしません。`
                  : invoiceAmountTouched
                    ? "請求金額は手入力値を優先しています。"
                    : "請求金額を入力してください。"
              }
            >
              <div className="relative">
                <input
                  type="number"
                  name="invoice_amount"
                  min="1"
                  step="1"
                  value={form.invoice_amount}
                  onChange={handleChange}
                  placeholder="例：1380000"
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
                  placeholder="請求条件や特記事項を入力"
                  className={inputClassName}
                  disabled={submitting}
                />
              </Field>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <Link
              href={`/cases/${caseData.id}`}
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
                : "請求を登録する"}
            </button>
          </div>
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
        <p className="mt-1 break-words text-sm text-gray-500">
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
          <span className="ml-1 text-red-600">*</span>
        ) : null}
      </span>

      {description ? (
        <span className="mt-1 block text-xs leading-5 text-gray-500">
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
  className = "",
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-bold text-gray-500">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-gray-900">
        {value || "-"}
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

function normalizeCaseLineType(
  value: string | null | undefined
): PriceTargetType {
  return String(value || "")
    .trim()
    .toUpperCase() === "PACKAGE"
    ? "PACKAGE"
    : "PRODUCT";
}

function toInvoiceLineForAutofill(
  caseProduct: CaseProduct
): InvoiceLineForAutofill {
  const lineType = normalizeCaseLineType(caseProduct.line_type);
  const product = getSingleRelation(caseProduct.products);
  const pkg = getSingleRelation(caseProduct.packages);
  const quantity = toNumber(caseProduct.quantity);

  return {
    id: caseProduct.id,
    lineType,
    productId: caseProduct.product_id,
    packageId: caseProduct.package_id,
    quantity: quantity > 0 ? quantity : 0,
    label:
      lineType === "PACKAGE"
        ? pkg?.name || "パッケージ"
        : product?.name || product?.model_no || "商品",
  };
}

async function resolveSalesPricesForCaseProducts(input: {
  products: CaseProduct[];
  dealerId: string;
  asOfDate: string;
}): Promise<ResolvedInvoiceLinePrice[]> {
  const { products, dealerId, asOfDate } = input;

  return Promise.all(
    products.map(async (caseProduct) => {
      const line = toInvoiceLineForAutofill(caseProduct);

      if (!dealerId) {
        return resolveLineFromLookup({
          line,
          found: false,
          unitPrice: 0,
          lookupError: null,
        });
      }

      if (line.lineType === "PRODUCT" && !line.productId) {
        return resolveLineFromLookup({
          line,
          found: false,
          unitPrice: 0,
          lookupError: null,
        });
      }

      if (line.lineType === "PACKAGE" && !line.packageId) {
        return resolveLineFromLookup({
          line,
          found: false,
          unitPrice: 0,
          lookupError: null,
        });
      }

      const lookup = await fetchActiveSalesPrice(supabase, {
        targetType: line.lineType,
        productId: line.productId,
        packageId: line.packageId,
        dealerId,
        asOfDate,
      });

      return resolveLineFromLookup({
        line,
        found: lookup.found,
        unitPrice: lookup.unitPrice,
        lookupError: lookup.error,
      });
    })
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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

function getDefaultDueDate(): string {
  /*
   * 初期値は翌月末です。
   */
  const now = new Date();

  const dueDate = new Date(
    now.getFullYear(),
    now.getMonth() + 2,
    0
  );

  const year = dueDate.getFullYear();
  const month = String(
    dueDate.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    dueDate.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function generateInvoiceNumber(
  caseNo: string | null
): string {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const normalizedCaseNo = caseNo
    ? caseNo
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-8)
    : "CASE";

  return `INV-${datePart}-${normalizedCaseNo}-${timePart}`;
}

function getCaseStatusFromInvoiceStatus(
  invoiceStatus: string
): string | null {
  switch (invoiceStatus) {
    case "未請求":
      return "請求待ち";

    case "請求書作成済":
      return "請求待ち";

    case "請求済":
      return "請求済";

    case "入金待ち":
      return "入金待ち";

    default:
      return null;
  }
}