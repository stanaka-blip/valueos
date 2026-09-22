"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  buildProductCopyFormValues,
  DUPLICATE_MODEL_NO_WARNING,
} from "@/app/components/masters/searchableSelect";
import { toProductActiveDbValue } from "@/lib/products/productActiveContract";
import { hasModelNoDuplicateHits } from "@/lib/products/modelNoDuplicate";
import { getProductUnitSelectOptions } from "@/lib/products/productUnits";
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

type Supplier = {
  id: string;
  name: string | null;
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
  default_supplier_id: string;
};

export default function NewProductPage() {
  const router = useRouter();
  const [copyFromId, setCopyFromId] = useState("");

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

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
    default_supplier_id: "",
  });

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("copyFrom") || "";
      setCopyFromId(id.trim());
    } catch {
      setCopyFromId("");
    }
  }, []);

  useEffect(() => {
    async function load() {
      setInitialLoading(true);
      setLoadError("");

      const [mRes, sRes, supplierRes, catRes] = await Promise.all([
        supabase
          .from("manufacturers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("product_series")
          .select("id, name, manufacturer_id")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id, name, is_active")
          .order("name", { ascending: true }),
        supabase.from("products").select("category"),
      ]);

      if (mRes.error) {
        setLoadError(`メーカー取得エラー：${mRes.error.message}`);
        setInitialLoading(false);
        return;
      }
      if (sRes.error) {
        setLoadError(`シリーズ取得エラー：${sRes.error.message}`);
        setInitialLoading(false);
        return;
      }
      if (supplierRes.error) {
        setLoadError(`仕入先取得エラー：${supplierRes.error.message}`);
        setInitialLoading(false);
        return;
      }

      setManufacturers((mRes.data || []) as Manufacturer[]);
      setSeriesList((sRes.data || []) as Series[]);
      setSuppliers(
        ((supplierRes.data || []) as { id: string; name: string | null; is_active: unknown }[])
          .filter((s) => s.is_active === true || s.is_active === "true" || s.is_active == null)
          .map((s) => ({ id: s.id, name: s.name }))
      );
      {
        const fromDb = Array.from(
          new Set(
            ((catRes.data || []) as { category: string | null }[])
              .map((r) => (r.category || "").trim())
              .filter(Boolean)
          )
        );
        const defaults = ["蓄電池", "太陽光", "パワコン", "架台", "部材"];
        setCategories(
          Array.from(new Set([...fromDb, ...defaults])).sort((a, b) =>
            a.localeCompare(b, "ja")
          )
        );
      }
      setInitialLoading(false);
    }

    load();
  }, []);


  useEffect(() => {
    if (!copyFromId || initialLoading || loadError) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "manufacturer_id, series_id, category, model_no, name, capacity, unit, memo, is_active, default_supplier_id"
        )
        .eq("id", copyFromId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setSubmitError(
          error
            ? `複製元商品の取得に失敗しました：${error.message}`
            : "複製元の商品が見つかりません。"
        );
        return;
      }
      setForm(buildProductCopyFormValues(data));
      setCopyNotice(
        "元商品の内容を初期表示しています。型番・商品名などを必要に応じて変更し、新規商品として保存してください（価格マスタはコピーされません）。"
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [copyFromId, initialLoading, loadError]);

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
    setSubmitError("");

    const manufacturerId = form.manufacturer_id;
    const productName = form.name.trim();
    const modelNo = form.model_no.trim();

    if (!manufacturerId) {
      setSubmitError("メーカーを選択してください。");
      return;
    }
    if (!productName) {
      setSubmitError("商品名を入力してください。");
      return;
    }
    if (!modelNo) {
      setSubmitError("型番を入力してください。");
      return;
    }

    setSubmitting(true);

    const { data: duplicateProducts, error: duplicateError } = await supabase
      .from("products")
      .select("id, name, category, model_no, is_active")
      .eq("manufacturer_id", manufacturerId)
      .eq("model_no", modelNo);

    if (duplicateError) {
      setSubmitError(`重複確認に失敗しました：${duplicateError.message}`);
      setSubmitting(false);
      return;
    }

    if (hasModelNoDuplicateHits(duplicateProducts)) {
      const ok = window.confirm(DUPLICATE_MODEL_NO_WARNING);
      if (!ok) {
        setSubmitting(false);
        return;
      }
    }

    const { data: created, error: insertError } = await supabase
      .from("products")
      .insert({
        manufacturer_id: manufacturerId,
        series_id: form.series_id || null,
        category: form.category.trim() || null,
        model_no: modelNo,
        name: productName,
        capacity: form.capacity.trim() || null,
        unit: form.unit.trim() || null,
        memo: form.memo.trim() || null,
        is_active: toProductActiveDbValue(form.is_active),
        default_supplier_id: form.default_supplier_id || null,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      setSubmitError(
        `登録に失敗しました：${insertError?.message || "不明なエラー"}`
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.push(`/products/${created.id}`);
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <PageHeader title="商品登録" description="マスタ情報を読み込んでいます。" />
        <main className="p-4 md:p-8">
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-gray-500">読み込み中...</p>
          </div>
        </main>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="商品登録" description="マスタ情報を取得できませんでした。" />
        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">データ取得エラー</p>
            <p className="mt-2 text-sm text-red-600">{loadError}</p>
            <button
              type="button"
              onClick={() => router.push("/products")}
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
        title={copyFromId ? "商品を複製して新規登録" : "商品登録"}
        description={
          copyFromId
            ? "元商品の情報を初期値として、新しい商品を登録します（価格はコピーしません）"
            : "メーカー・シリーズ・商品名・型番を登録します"
        }
      />

      <main className="p-4 md:p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-4xl rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">商品情報</h2>
            <p className="mt-1 text-sm text-gray-500">
              メーカー、商品名、型番は必須です。保証は備考に記載できます。
            </p>
          </div>

          {copyNotice ? (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {copyNotice}
            </div>
          ) : null}

          {submitError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
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
                {manufacturers.map((manufacturer) => (
                  <option key={manufacturer.id} value={manufacturer.id}>
                    {manufacturer.name || "名称未設定"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="シリーズ" description="メーカー配下のシリーズ">
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

            <Field label="カテゴリ" description="登録済みカテゴリから選択できます">
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">未設定</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="商品名" required>
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

            <Field label="型番" required>
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

            <Field label="容量" description="数値と単位を分けて入力します">
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

            <Field
              label="単位"
              description="カテゴリに関係なく選択できます（例: PVでも枚 / kW）"
            >
              <select
                name="unit"
                value={form.unit}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">単位を選択</option>
                {getProductUnitSelectOptions(form.unit).map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="標準仕入先"
              description="案件登録時に自動設定されます。未設定も可能です。"
            >
              <select
                name="default_supplier_id"
                value={form.default_supplier_id}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">未設定</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "名称未設定"}
                  </option>
                ))}
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
            <Field label="備考（保証・仕様など）">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={5}
                disabled={submitting}
                placeholder="保証年数、商品仕様、注意事項など"
                className={inputClassName}
              />
            </Field>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.push("/products")}
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
              {submitting ? "登録しています..." : "商品を登録する"}
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
