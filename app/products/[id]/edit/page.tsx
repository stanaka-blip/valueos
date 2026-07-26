"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  use,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Manufacturer = {
  id: string;
  name: string | null;
};

type Series = {
  id: string;
  name: string | null;
  manufacturer_id: string | null;
};

type ProductForm = {
  manufacturer_id: string;
  series_id: string;
  category: string;
  model_no: string;
  name: string;
  capacity: string;
  unit: string;
  memo: string;
  is_active: boolean;
};

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<ProductForm>({
    manufacturer_id: "",
    series_id: "",
    category: "",
    model_no: "",
    name: "",
    capacity: "",
    unit: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const [mRes, sRes, pRes] = await Promise.all([
        supabase
          .from("manufacturers")
          .select("id, name")
          .order("name", { ascending: true }),
        supabase
          .from("product_series")
          .select("id, name, manufacturer_id")
          .order("name", { ascending: true }),
        supabase.from("products").select("*").eq("id", id).maybeSingle(),
      ]);

      if (mRes.error || sRes.error || pRes.error || !pRes.data) {
        setError(
          mRes.error?.message ||
            sRes.error?.message ||
            pRes.error?.message ||
            "商品が見つかりません"
        );
        setLoading(false);
        return;
      }

      const row = pRes.data;
      setManufacturers((mRes.data || []) as Manufacturer[]);
      setSeriesList((sRes.data || []) as Series[]);
      setForm({
        manufacturer_id: (row.manufacturer_id as string) || "",
        series_id: (row.series_id as string) || "",
        category: (row.category as string) || "",
        model_no: (row.model_no as string) || "",
        name: (row.name as string) || "",
        capacity: (row.capacity as string) || "",
        unit: (row.unit as string) || "",
        memo: (row.memo as string) || "",
        is_active: Boolean(row.is_active),
      });
      setLoading(false);
    }

    load();
  }, [id]);

  const filteredSeries = useMemo(
    () =>
      seriesList.filter(
        (s) => !form.manufacturer_id || s.manufacturer_id === form.manufacturer_id
      ),
    [seriesList, form.manufacturer_id]
  );

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const target = event.target;
    const { name } = target;

    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      setForm((current) => ({ ...current, [name]: target.checked }));
      return;
    }

    if (name === "manufacturer_id") {
      setForm((current) => ({
        ...current,
        manufacturer_id: target.value,
        series_id: "",
      }));
      return;
    }

    setForm((current) => ({ ...current, [name]: target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.manufacturer_id) {
      setError("メーカーを選択してください。");
      return;
    }
    if (!form.name.trim()) {
      setError("商品名を入力してください。");
      return;
    }
    if (!form.model_no.trim()) {
      setError("型番を入力してください。");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase
      .from("products")
      .update({
        manufacturer_id: form.manufacturer_id,
        series_id: form.series_id || null,
        category: form.category.trim() || null,
        model_no: form.model_no.trim(),
        name: form.name.trim(),
        capacity: form.capacity.trim() || null,
        unit: form.unit.trim() || null,
        memo: form.memo.trim() || null,
        is_active: form.is_active,
      })
      .eq("id", id);
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/products");
    router.refresh();
  }

  if (loading) {
    return (
      <>
        <PageHeader title="商品編集" description="読み込み中..." />
        <main className="p-8">
          <p className="text-sm text-gray-500">読み込み中...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader title="商品編集" description="商品マスタを更新します" />
      <main className="p-4 md:p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-4xl rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          {error ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="メーカー" required>
              <select
                name="manufacturer_id"
                value={form.manufacturer_id}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">メーカーを選択</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || "名称未設定"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="シリーズ">
              <select
                name="series_id"
                value={form.series_id}
                onChange={handleChange}
                disabled={submitting || !form.manufacturer_id}
                className={inputClassName}
              >
                <option value="">シリーズを選択（任意）</option>
                {filteredSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "名称未設定"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="カテゴリ">
              <input
                type="text"
                name="category"
                value={form.category}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="商品名" required>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="型番" required>
              <input
                type="text"
                name="model_no"
                value={form.model_no}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="容量">
              <input
                type="text"
                name="capacity"
                value={form.capacity}
                onChange={handleChange}
                disabled={submitting}
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
                <option value="">単位を選択</option>
                <option value="台">台</option>
                <option value="枚">枚</option>
                <option value="個">個</option>
                <option value="式">式</option>
                <option value="kW">kW</option>
                <option value="kWh">kWh</option>
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
                <span className="text-sm font-semibold text-gray-700">有効</span>
              </label>
            </Field>
          </div>

          <div className="mt-5">
            <Field label="備考（保証・仕様など）">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={5}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.push("/products")}
              disabled={submitting}
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? "保存中..." : "保存する"}
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
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description ? (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
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
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </p>
      {description ? (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      ) : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}
