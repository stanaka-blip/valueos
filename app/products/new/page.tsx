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

type Manufacturer = {
  id: string;
  name: string | null;
};

type ProductForm = {
  manufacturer_id: string;
  category: string;
  model_no: string;
  name: string;
  capacity: string;
  unit: string;
  memo: string;
  is_active: boolean;
};

export default function NewProductPage() {
  const router = useRouter();

  const [manufacturers, setManufacturers] = useState<
    Manufacturer[]
  >([]);

  const [initialLoading, setInitialLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [loadError, setLoadError] =
    useState("");

  const [submitError, setSubmitError] =
    useState("");

  const [form, setForm] = useState<ProductForm>({
    manufacturer_id: "",
    category: "",
    model_no: "",
    name: "",
    capacity: "",
    unit: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    async function fetchManufacturers() {
      setInitialLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("manufacturers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", {
          ascending: true,
        });

      if (error) {
        setLoadError(
          `メーカー取得エラー：${error.message}`
        );
        setInitialLoading(false);
        return;
      }

      setManufacturers(
        (data || []) as Manufacturer[]
      );

      setInitialLoading(false);
    }

    fetchManufacturers();
  }, []);

  function handleChange(
    event: ChangeEvent<
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
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

    const manufacturerId =
      form.manufacturer_id;

    const productName =
      form.name.trim();

    const modelNo =
      form.model_no.trim();

    if (!manufacturerId) {
      setSubmitError(
        "メーカーを選択してください。"
      );
      return;
    }

    if (!productName) {
      setSubmitError(
        "商品名を入力してください。"
      );
      return;
    }

    if (!modelNo) {
      setSubmitError(
        "品番を入力してください。"
      );
      return;
    }

    setSubmitting(true);

    const {
      data: duplicateProduct,
      error: duplicateError,
    } = await supabase
      .from("products")
      .select("id")
      .eq(
        "manufacturer_id",
        manufacturerId
      )
      .eq("model_no", modelNo)
      .maybeSingle();

    if (duplicateError) {
      setSubmitError(
        `重複確認に失敗しました：${duplicateError.message}`
      );
      setSubmitting(false);
      return;
    }

    if (duplicateProduct) {
      setSubmitError(
        "同じメーカー・同じ品番の商品がすでに登録されています。"
      );
      setSubmitting(false);
      return;
    }

    const {
      data: insertedProduct,
      error: insertError,
    } = await supabase
      .from("products")
      .insert({
        manufacturer_id:
          manufacturerId,
        category:
          form.category.trim() || null,
        model_no: modelNo,
        name: productName,
        capacity:
          form.capacity.trim() || null,
        unit:
          form.unit.trim() || null,
        memo:
          form.memo.trim() || null,
        is_active:
          form.is_active,
      })
      .select("id")
      .single();

    if (
      insertError ||
      !insertedProduct
    ) {
      setSubmitError(
        `登録に失敗しました：${
          insertError?.message ||
          "登録結果を取得できませんでした"
        }`
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);

    router.push("/products");
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <PageHeader
          title="商品登録"
          description="メーカー情報を読み込んでいます。"
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
          title="商品登録"
          description="メーカー情報を取得できませんでした。"
        />

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              データ取得エラー
            </p>

            <p className="mt-2 text-sm text-red-600">
              {loadError}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/products")
              }
              className="mt-5 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"
            >
              商品一覧へ戻る
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="商品登録"
        description="メーカー・商品名・品番を登録します"
      />

      <main className="p-4 md:p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-4xl rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              商品情報
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              メーカー、商品名、品番は必須です。
            </p>
          </div>

          {submitError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="メーカー"
              required
            >
              <select
                name="manufacturer_id"
                value={
                  form.manufacturer_id
                }
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">
                  メーカーを選択
                </option>

                {manufacturers.map(
                  (manufacturer) => (
                    <option
                      key={manufacturer.id}
                      value={manufacturer.id}
                    >
                      {manufacturer.name ||
                        "名称未設定"}
                    </option>
                  )
                )}
              </select>
            </Field>

            <Field
              label="カテゴリ"
              description="例：太陽光、蓄電池、パワコン、エコキュート"
            >
              <input
                type="text"
                name="category"
                value={form.category}
                onChange={handleChange}
                disabled={submitting}
                placeholder="例：蓄電池"
                className={inputClassName}
              />
            </Field>

            <Field
              label="商品名"
              required
            >
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                disabled={submitting}
                placeholder="例：スマートPVマルチ"
                className={inputClassName}
              />
            </Field>

            <Field
              label="品番"
              required
            >
              <input
                type="text"
                name="model_no"
                value={form.model_no}
                onChange={handleChange}
                required
                disabled={submitting}
                placeholder="例：CB-P127M05A"
                className={inputClassName}
              />
            </Field>

            <Field
              label="容量"
              description="数値と単位を分けて入力します"
            >
              <input
                type="text"
                name="capacity"
                value={form.capacity}
                onChange={handleChange}
                disabled={submitting}
                placeholder="例：12.7"
                className={inputClassName}
              />
            </Field>

            <Field label="単位">
              <select
                name="unit"
                value={form.unit}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">
                  単位を選択
                </option>
                <option value="台">
                  台
                </option>
                <option value="枚">
                  枚
                </option>
                <option value="個">
                  個
                </option>
                <option value="式">
                  式
                </option>
                <option value="kW">
                  kW
                </option>
                <option value="kWh">
                  kWh
                </option>
              </select>
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
                  有効な商品として登録する
                </span>
              </label>
            </Field>
          </div>

          <div className="mt-5">
            <Field label="備考">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={5}
                disabled={submitting}
                placeholder="商品仕様、保証、注意事項など"
                className={inputClassName}
              />
            </Field>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() =>
                router.push("/products")
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
                : "商品を登録する"}
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
    <div>
      <p className="text-sm font-bold text-gray-700">
        {label}

        {required ? (
          <span className="ml-1 text-red-600">
            *
          </span>
        ) : null}
      </p>

      {description ? (
        <p className="mt-1 text-xs text-gray-500">
          {description}
        </p>
      ) : null}

      <div className="mt-2">
        {children}
      </div>
    </div>
  );
}