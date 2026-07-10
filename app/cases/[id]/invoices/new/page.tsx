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
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  dealer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  site_address: string | null;
  status: string | null;
  dealers: Dealer | Dealer[] | null;
};

type ProductRelation = {
  name: string | null;
  model_no: string | null;
};

type CaseProduct = {
  id: string;
  quantity: number | null;
  sales_price: number | string | null;
  products: ProductRelation | ProductRelation[] | null;
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

  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [caseProducts, setCaseProducts] = useState<CaseProduct[]>([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState<InvoiceForm>({
    invoice_no: "",
    invoice_date: getTodayString(),
    due_date: getDefaultDueDate(),
    invoice_amount: "",
    status: "請求済",
    memo: "",
  });

  useEffect(() => {
    if (!routeCaseIdentifier) {
      setLoadError("案件を特定できませんでした。");
      setInitialLoading(false);
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
            quantity,
            sales_price,
            products (
              name,
              model_no
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

      const totalSales = calculateSalesTotal(
        normalizedProducts
      );

      setForm((current) => ({
        ...current,
        invoice_no:
          current.invoice_no ||
          generateInvoiceNumber(normalizedCase.case_no),
        invoice_amount:
          totalSales > 0
            ? String(totalSales)
            : current.invoice_amount,
      }));

      setInitialLoading(false);
    }

    fetchInitialData();
  }, [routeCaseIdentifier]);

  const dealer = useMemo(() => {
    return getSingleRelation(caseData?.dealers);
  }, [caseData]);

  const productSalesTotal = useMemo(() => {
    return calculateSalesTotal(caseProducts);
  }, [caseProducts]);

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

    if (!caseData) {
      setSubmitError(
        "案件情報を取得できていません。画面を更新してください。"
      );
      return;
    }

    setSubmitError("");

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
     */
    const { data: insertedInvoice, error: invoiceError } =
      await supabase
        .from("invoices")
        .insert({
          case_id: caseData.id,
          invoice_no: form.invoice_no.trim(),
          invoice_date: form.invoice_date,
          due_date: form.due_date || null,
          invoice_amount: invoiceAmount,
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
        <div>
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
            請求商品
          </h2>

          {caseProducts.length > 0 ? (
            <div className="space-y-3">
              {caseProducts.map((caseProduct, index) => {
                const product = getSingleRelation(
                  caseProduct.products
                );

                return (
                  <div
                    key={caseProduct.id}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-4">
                      <Info
                        label={`商品 ${index + 1}`}
                        value={product?.name}
                      />

                      <Info
                        label="品番"
                        value={product?.model_no}
                      />

                      <Info
                        label="数量"
                        value={String(
                          caseProduct.quantity ?? "-"
                        )}
                      />

                      <Info
                        label="販売金額"
                        value={formatCurrency(
                          caseProduct.sales_price
                        )}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs font-bold text-gray-500">
                  案件商品販売合計
                </p>

                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {formatCurrency(productSalesTotal)}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              この案件には商品が登録されていません。
              請求金額を手入力してください。
            </div>
          )}
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-5 shadow-sm md:p-6"
        >
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            請求情報
          </h2>

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
                productSalesTotal > 0
                  ? `案件商品販売合計 ${formatCurrency(
                      productSalesTotal
                    )} を初期入力しています。`
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

function calculateSalesTotal(
  products: CaseProduct[]
): number {
  /*
   * 現在のValueOSでは、
   * case_products.sales_priceに数量込み合計が保存されています。
   * そのため数量は掛けず、そのまま合計します。
   */
  return products.reduce(
    (total, product) =>
      total + toNumber(product.sales_price),
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