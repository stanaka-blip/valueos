"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Supplier = {
  id: string;
  name: string | null;
};

type DealerRelationItem = {
  default_supplier_id: string | null;
};

type CaseRelation = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  dealer_id: string | null;
  desired_delivery_date: string | null;
  dealers:
    | DealerRelationItem
    | DealerRelationItem[]
    | null;
};

type CaseProduct = {
  purchase_price: number | string | null;
};

type OrderForm = {
  supplier_id: string;
  order_no: string;
  order_date: string;
  expected_delivery_date: string;
  order_amount: string;
  status: string;
  memo: string;
};

const ORDER_STATUSES = [
  "未発注",
  "発注済",
  "納期回答待ち",
  "納期確定",
  "一部納品",
  "納品済",
];

export default function NewOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const caseId = params?.id || "";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [caseData, setCaseData] = useState<CaseRelation | null>(
    null
  );

  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState<OrderForm>({
    supplier_id: "",
    order_no: "",
    order_date: getTodayString(),
    expected_delivery_date: "",
    order_amount: "",
    status: "発注済",
    memo: "",
  });

  useEffect(() => {
    if (!caseId) {
      setLoadError("案件IDを取得できませんでした。");
      setInitialLoading(false);
      return;
    }

    if (!isUuid(caseId)) {
      setLoadError(
        "案件IDの形式が正しくありません。案件一覧から開き直してください。"
      );
      setInitialLoading(false);
      return;
    }

    async function fetchInitialData() {
      setInitialLoading(true);
      setLoadError("");

      const [
        {
          data: supplierData,
          error: supplierError,
        },
        {
          data: rawCaseData,
          error: caseError,
        },
        {
          data: rawCaseProducts,
          error: caseProductsError,
        },
      ] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", {
            ascending: true,
          }),

        supabase
          .from("cases")
          .select(`
            id,
            case_no,
            customer_name,
            dealer_id,
            desired_delivery_date,
            dealers (
              default_supplier_id
            )
          `)
          .eq("id", caseId)
          .single(),

        supabase
          .from("case_products")
          .select("purchase_price")
          .eq("case_id", caseId),
      ]);

      if (supplierError) {
        setLoadError(
          `仕入先の取得に失敗しました：${supplierError.message}`
        );
        setInitialLoading(false);
        return;
      }

      if (caseError || !rawCaseData) {
        setLoadError(
          `案件情報の取得に失敗しました：${
            caseError?.message ||
            "案件が見つかりませんでした"
          }`
        );
        setInitialLoading(false);
        return;
      }

      if (caseProductsError) {
        setLoadError(
          `案件商品の取得に失敗しました：${caseProductsError.message}`
        );
        setInitialLoading(false);
        return;
      }

      const normalizedCase =
        rawCaseData as unknown as CaseRelation;

      const normalizedProducts =
        (rawCaseProducts || []) as CaseProduct[];

      setSuppliers((supplierData || []) as Supplier[]);
      setCaseData(normalizedCase);

      const dealerRelation =
        normalizedCase.dealers;

      const dealer = Array.isArray(dealerRelation)
        ? dealerRelation[0] || null
        : dealerRelation;

      const defaultSupplierId =
        dealer?.default_supplier_id || "";

      const totalOrderAmount =
        normalizedProducts.reduce(
          (sum, product) =>
            sum +
            toNumber(product.purchase_price),
          0
        );

      setForm((current) => ({
        ...current,
        supplier_id:
          current.supplier_id ||
          defaultSupplierId,
        order_no:
          current.order_no ||
          generateOrderNumber(
            normalizedCase.case_no
          ),
        expected_delivery_date:
          current.expected_delivery_date ||
          normalizedCase.desired_delivery_date ||
          "",
        order_amount:
          totalOrderAmount > 0
            ? String(totalOrderAmount)
            : current.order_amount,
      }));

      setInitialLoading(false);
    }

    fetchInitialData();
  }, [caseId]);

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

    setSubmitError("");

    if (!caseData) {
      setSubmitError(
        "案件情報を取得できていません。画面を更新してください。"
      );
      return;
    }

    if (!form.supplier_id) {
      setSubmitError(
        "仕入先を選択してください。"
      );
      return;
    }

    if (!form.order_no.trim()) {
      setSubmitError(
        "発注番号を入力してください。"
      );
      return;
    }

    if (!form.order_date) {
      setSubmitError(
        "発注日を入力してください。"
      );
      return;
    }

    if (
      form.expected_delivery_date &&
      form.expected_delivery_date <
        form.order_date
    ) {
      setSubmitError(
        "納品予定日は発注日以降に設定してください。"
      );
      return;
    }

    const orderAmount = toNumber(
      form.order_amount
    );

    if (orderAmount <= 0) {
      setSubmitError(
        "発注金額は1円以上で入力してください。"
      );
      return;
    }

    setSubmitting(true);

    const {
      data: duplicateOrder,
      error: duplicateError,
    } = await supabase
      .from("orders")
      .select("id")
      .eq("order_no", form.order_no.trim())
      .maybeSingle();

    if (duplicateError) {
      setSubmitError(
        `発注番号の確認に失敗しました：${duplicateError.message}`
      );
      setSubmitting(false);
      return;
    }

    if (duplicateOrder) {
      setSubmitError(
        "同じ発注番号がすでに登録されています。別の発注番号を入力してください。"
      );
      setSubmitting(false);
      return;
    }

    const {
      data: insertedOrder,
      error: orderError,
    } = await supabase
      .from("orders")
      .insert({
        case_id: caseData.id,
        supplier_id: form.supplier_id,
        order_no: form.order_no.trim(),
        order_date: form.order_date,
        expected_delivery_date:
          form.expected_delivery_date ||
          null,
        order_amount: orderAmount,
        status: form.status,
        memo:
          form.memo.trim() || null,
      })
      .select("id")
      .single();

    if (orderError || !insertedOrder) {
      setSubmitError(
        `発注登録に失敗しました：${
          orderError?.message ||
          "登録結果を取得できませんでした"
        }`
      );
      setSubmitting(false);
      return;
    }

    const nextCaseStatus =
      getCaseStatusFromOrderStatus(
        form.status
      );

    if (nextCaseStatus) {
      const {
        error: caseStatusError,
      } = await supabase
        .from("cases")
        .update({
          status: nextCaseStatus,
        })
        .eq("id", caseData.id);

      if (caseStatusError) {
        window.alert(
          `発注は登録されましたが、案件ステータスの更新に失敗しました。\n${caseStatusError.message}`
        );
      }
    }

    setSubmitting(false);

    router.push(
      `/orders/${insertedOrder.id}`
    );
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <PageHeader
          title="発注登録"
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
          title="発注登録"
          description="案件情報を取得できませんでした。"
        />

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              データ取得エラー
            </p>

            <p className="mt-2 break-words text-sm text-red-600">
              {loadError ||
                "案件情報が見つかりませんでした。"}
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
        title="発注登録"
        description={`案件番号：${
          caseData.case_no || "-"
        } / 顧客名：${
          caseData.customer_name || "-"
        }`}
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
            発注対象案件
          </h2>

          <div className="grid gap-5 md:grid-cols-3">
            <Info
              label="案件番号"
              value={caseData.case_no}
            />

            <Info
              label="顧客名"
              value={caseData.customer_name}
            />

            <Info
              label="案件希望納期"
              value={formatDate(
                caseData.desired_delivery_date
              )}
            />
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            発注情報
          </h2>

          {submitError ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="仕入先"
              required
            >
              <select
                name="supplier_id"
                value={form.supplier_id}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">
                  仕入先を選択
                </option>

                {suppliers.map((supplier) => (
                  <option
                    key={supplier.id}
                    value={supplier.id}
                  >
                    {supplier.name || "名称未設定"}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="発注番号"
              required
              description="自動採番されています。必要に応じて変更できます。"
            >
              <input
                type="text"
                name="order_no"
                value={form.order_no}
                onChange={handleChange}
                placeholder="例：PO-202607-001"
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field
              label="発注日"
              required
            >
              <input
                type="date"
                name="order_date"
                value={form.order_date}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="納品予定日">
              <input
                type="date"
                name="expected_delivery_date"
                value={
                  form.expected_delivery_date
                }
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field
              label="発注金額"
              required
              description="案件商品の仕入合計を初期入力しています。"
            >
              <div className="relative">
                <input
                  type="number"
                  name="order_amount"
                  value={form.order_amount}
                  onChange={handleChange}
                  min="1"
                  step="1"
                  required
                  disabled={submitting}
                  className={`${inputClassName} pr-10 text-right`}
                />

                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  円
                </span>
              </div>
            </Field>

            <Field
              label="発注ステータス"
              required
            >
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                {ORDER_STATUSES.map(
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
          </div>

          <div className="mt-6">
            <Field label="備考">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={5}
                placeholder="納品条件、配送先への注意事項、仕入先への連絡事項など"
                disabled={submitting}
                className={inputClassName}
              />
            </Field>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <Link
              href={`/cases/${caseData.id}`}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </Link>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting
                ? "登録しています..."
                : "発注を登録する"}
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

      <div className="mt-2">
        {children}
      </div>
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

      <p className="mt-1 break-words text-sm font-semibold text-gray-900">
        {value || "-"}
      </p>
    </div>
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

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "-";
  }

  const date = new Date(
    `${value}T00:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ja-JP");
}

function generateOrderNumber(
  caseNo: string | null
): string {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(
      2,
      "0"
    ),
    String(now.getDate()).padStart(
      2,
      "0"
    ),
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(
      2,
      "0"
    ),
    String(now.getMinutes()).padStart(
      2,
      "0"
    ),
    String(now.getSeconds()).padStart(
      2,
      "0"
    ),
  ].join("");

  const normalizedCaseNo = caseNo
    ? caseNo
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-8)
    : "CASE";

  return `PO-${datePart}-${normalizedCaseNo}-${timePart}`;
}

function getCaseStatusFromOrderStatus(
  orderStatus: string
): string | null {
  switch (orderStatus) {
    case "未発注":
      return "発注待ち";

    case "発注済":
      return "発注済";

    case "納期回答待ち":
      return "納期回答待ち";

    case "納期確定":
      return "納品待ち";

    case "一部納品":
      return "納品待ち";

    case "納品済":
      return "納品済";

    default:
      return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}