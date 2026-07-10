"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type ManufacturerRelationItem = {
  name: string | null;
};

type ManufacturerRelation =
  | ManufacturerRelationItem
  | ManufacturerRelationItem[]
  | null;

type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: ManufacturerRelation;
};

type Supplier = {
  id: string;
  name: string | null;
};

type PriceForm = {
  product_id: string;
  supplier_id: string;
  purchase_price: string;
  start_date: string;
  end_date: string;
  memo: string;
  is_active: boolean;
};

export default function NewPricePage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState<PriceForm>({
    product_id: "",
    supplier_id: "",
    purchase_price: "",
    start_date: getTodayString(),
    end_date: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    async function fetchData() {
      setInitialLoading(true);
      setLoadError("");

      const [
        {
          data: productData,
          error: productError,
        },
        {
          data: supplierData,
          error: supplierError,
        },
      ] = await Promise.all([
        supabase
          .from("products")
          .select(`
            id,
            name,
            model_no,
            category,
            manufacturers (
              name
            )
          `)
          .eq("is_active", true)
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("suppliers")
          .select(`
            id,
            name
          `)
          .eq("is_active", true)
          .order("name", {
            ascending: true,
          }),
      ]);

      if (productError) {
        setLoadError(
          `商品取得エラー：${productError.message}`
        );
        setInitialLoading(false);
        return;
      }

      if (supplierError) {
        setLoadError(
          `仕入先取得エラー：${supplierError.message}`
        );
        setInitialLoading(false);
        return;
      }

      /*
       * Supabaseのリレーション型は、
       * DB定義や生成型によって単体または配列として推論されることがあります。
       * unknownを経由して、画面側で安全に吸収します。
       */
      const normalizedProducts =
        (productData || []) as unknown as Product[];

      const normalizedSuppliers =
        (supplierData || []) as Supplier[];

      setProducts(normalizedProducts);
      setSuppliers(normalizedSuppliers);
      setInitialLoading(false);
    }

    fetchData();
  }, []);

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement |
      HTMLTextAreaElement |
      HTMLSelectElement
    >
  ) {
    const target = event.target;
    const { name } = target;

    if (
      target instanceof HTMLInputElement &&
      target.type === "checkbox"
    ) {
      setForm((current) => ({
        ...current,
        [name]: target.checked,
      }));

      return;
    }

    setForm((current) => ({
      ...current,
      [name]: target.value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSubmitError("");

    if (!form.product_id) {
      setSubmitError(
        "商品を選択してください。"
      );
      return;
    }

    if (!form.supplier_id) {
      setSubmitError(
        "仕入先を選択してください。"
      );
      return;
    }

    const purchasePrice = toNumber(
      form.purchase_price
    );

    if (purchasePrice <= 0) {
      setSubmitError(
        "仕入価格は1円以上で入力してください。"
      );
      return;
    }

    if (
      form.start_date &&
      form.end_date &&
      form.end_date < form.start_date
    ) {
      setSubmitError(
        "適用終了日は適用開始日以降に設定してください。"
      );
      return;
    }

    setSubmitting(true);

    /*
     * 同じ商品・仕入先・開始日の価格が
     * すでに登録済みでないか確認します。
     */
    let duplicateQuery = supabase
      .from("purchase_prices")
      .select("id")
      .eq("product_id", form.product_id)
      .eq("supplier_id", form.supplier_id);

    if (form.start_date) {
      duplicateQuery = duplicateQuery.eq(
        "start_date",
        form.start_date
      );
    } else {
      duplicateQuery =
        duplicateQuery.is("start_date", null);
    }

    const {
      data: duplicatePrice,
      error: duplicateError,
    } = await duplicateQuery.maybeSingle();

    if (duplicateError) {
      setSubmitError(
        `重複確認に失敗しました：${duplicateError.message}`
      );
      setSubmitting(false);
      return;
    }

    if (duplicatePrice) {
      setSubmitError(
        "同じ商品・仕入先・適用開始日の価格がすでに登録されています。"
      );
      setSubmitting(false);
      return;
    }

    const { error: insertError } =
      await supabase
        .from("purchase_prices")
        .insert({
          product_id: form.product_id,
          supplier_id: form.supplier_id,
          purchase_price: purchasePrice,
          start_date:
            form.start_date || null,
          end_date:
            form.end_date || null,
          memo:
            form.memo.trim() || null,
          is_active: form.is_active,
        });

    if (insertError) {
      setSubmitError(
        `登録に失敗しました：${insertError.message}`
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);

    router.push("/prices");
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <PageHeader
          title="価格登録"
          description="商品・仕入先情報を読み込んでいます。"
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

  if (loadError) {
    return (
      <>
        <PageHeader
          title="価格登録"
          description="データを取得できませんでした。"
        />

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              データ取得エラー
            </p>

            <p className="mt-2 break-words text-sm text-red-600">
              {loadError}
            </p>

            <button
              type="button"
              onClick={() => router.push("/prices")}
              className="mt-5 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"
            >
              価格一覧へ戻る
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="価格登録"
        description="商品ごとの仕入先別価格を登録します"
      />

      <main className="p-4 md:p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-5xl rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              仕入価格情報
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              商品・仕入先・適用期間を設定してください。
            </p>
          </div>

          {submitError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="商品"
              required
            >
              <select
                name="product_id"
                value={form.product_id}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">
                  商品を選択
                </option>

                {products.map((product) => (
                  <option
                    key={product.id}
                    value={product.id}
                  >
                    {getManufacturerName(
                      product.manufacturers
                    )}{" "}
                    / {product.category || "-"} /{" "}
                    {product.model_no || "-"} /{" "}
                    {product.name || "-"}
                  </option>
                ))}
              </select>
            </Field>

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
              label="仕入価格（税抜）"
              required
            >
              <div className="relative">
                <input
                  type="number"
                  name="purchase_price"
                  value={form.purchase_price}
                  onChange={handleChange}
                  required
                  min="1"
                  step="1"
                  placeholder="例：815000"
                  disabled={submitting}
                  className={`${inputClassName} pr-10 text-right`}
                />

                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  円
                </span>
              </div>
            </Field>

            <Field
              label="適用開始日"
              required
              description="この日以降、案件商品追加時に自動取得されます。"
            >
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field
              label="適用終了日"
              description="終了日が未定の場合は空欄にしてください。"
            >
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                min={form.start_date || undefined}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="状態">
              <label className="flex min-h-12 items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                  disabled={submitting}
                  className="h-4 w-4"
                />

                <span className="text-sm font-semibold text-gray-700">
                  有効な価格として登録する
                </span>
              </label>
            </Field>
          </div>

          <div className="mt-6">
            <Field label="備考">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={5}
                placeholder="価格条件、キャンペーン、担当者からの連絡事項など"
                disabled={submitting}
                className={inputClassName}
              />
            </Field>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() =>
                router.push("/prices")
              }
              disabled={submitting}
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting
                ? "登録しています..."
                : "登録する"}
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
    <div className="block">
      <p className="text-sm font-bold text-gray-700">
        {label}

        {required ? (
          <span className="ml-1 text-red-600">
            *
          </span>
        ) : null}
      </p>

      {description ? (
        <p className="mt-1 text-xs leading-5 text-gray-500">
          {description}
        </p>
      ) : null}

      <div className="mt-2">
        {children}
      </div>
    </div>
  );
}

function getManufacturerName(
  relation: ManufacturerRelation
): string {
  if (!relation) {
    return "-";
  }

  if (Array.isArray(relation)) {
    return relation[0]?.name || "-";
  }

  return relation.name || "-";
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