"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  use,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PRICE_TARGET_OPTIONS,
  type PriceTargetType,
} from "@/lib/prices/targetType";

type Dealer = { id: string; name: string | null };
type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
};
type PackageRow = {
  id: string;
  name: string | null;
  package_code: string | null;
};

export default function EditSalesPricePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    dealer_id: "",
    price_target_type: "PRODUCT" as PriceTargetType,
    product_id: "",
    package_id: "",
    sales_price: "",
    start_date: "",
    end_date: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    async function load() {
      const [dRes, pRes, pkgRes, row] = await Promise.all([
        supabase.from("dealers").select("id, name").order("name"),
        supabase
          .from("products")
          .select("id, name, model_no, category")
          .order("name"),
        supabase
          .from("packages")
          .select("id, name, package_code")
          .eq("is_active", true)
          .order("name"),
        supabase.from("sales_prices").select("*").eq("id", id).maybeSingle(),
      ]);
      if (dRes.error || pRes.error || pkgRes.error || row.error || !row.data) {
        setError(
          dRes.error?.message ||
            pRes.error?.message ||
            pkgRes.error?.message ||
            row.error?.message ||
            "販売価格が見つかりません"
        );
        setLoading(false);
        return;
      }
      setDealers((dRes.data || []) as Dealer[]);
      setProducts((pRes.data || []) as Product[]);
      setPackages((pkgRes.data || []) as PackageRow[]);
      const d = row.data;
      setForm({
        dealer_id: (d.dealer_id as string) || "",
        price_target_type: (d.price_target_type as PriceTargetType) || "PRODUCT",
        product_id: (d.product_id as string) || "",
        package_id: (d.package_id as string) || "",
        sales_price: d.sales_price != null ? String(d.sales_price) : "",
        start_date: (d.start_date as string) || "",
        end_date: (d.end_date as string) || "",
        memo: (d.memo as string) || "",
        is_active: Boolean(d.is_active),
      });
      setLoading(false);
    }
    load();
  }, [id]);

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const target = e.target;
    const { name, value } = target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      setForm((f) => ({ ...f, [name]: target.checked }));
      return;
    }
    if (name === "price_target_type") {
      setForm((f) => ({
        ...f,
        price_target_type: value as PriceTargetType,
        product_id: "",
        package_id: "",
      }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const isProduct = form.price_target_type === "PRODUCT";
    if (!form.dealer_id) {
      setError("販売店を選択してください。");
      return;
    }
    if (isProduct && !form.product_id) {
      setError("商品を選択してください。");
      return;
    }
    if (!isProduct && !form.package_id) {
      setError("パッケージ商品を選択してください。");
      return;
    }
    const price = Number(form.sales_price);
    if (!price || price <= 0) {
      setError("販売価格は1円以上で入力してください。");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("sales_prices")
      .update({
        dealer_id: form.dealer_id,
        price_target_type: form.price_target_type,
        product_id: isProduct ? form.product_id : null,
        package_id: isProduct ? null : form.package_id,
        sales_price: price,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        memo: form.memo.trim() || null,
        is_active: form.is_active,
      })
      .eq("id", id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push("/sales-prices");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="p-8">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  const isProduct = form.price_target_type === "PRODUCT";

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">販売価格編集</h1>
        <p className="text-sm text-gray-500">
          価格改定・価格対象切替・内容更新ができます
        </p>
      </header>
      <main className="p-8">
        <form
          onSubmit={onSubmit}
          className="mx-auto max-w-4xl rounded-xl bg-white p-8 shadow-sm"
        >
          {error ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="販売店" required>
              <select
                name="dealer_id"
                value={form.dealer_id}
                onChange={handleChange}
                className={inputClassName}
              >
                <option value="">販売店を選択</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="価格対象" required>
              <select
                name="price_target_type"
                value={form.price_target_type}
                onChange={handleChange}
                className={inputClassName}
              >
                {PRICE_TARGET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            {isProduct ? (
              <Field label="商品" required>
                <select
                  name="product_id"
                  value={form.product_id}
                  onChange={handleChange}
                  className={inputClassName}
                >
                  <option value="">商品を選択</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.category || "-"} / {p.model_no || "-"} / {p.name || "-"}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="パッケージ商品" required>
                <select
                  name="package_id"
                  value={form.package_id}
                  onChange={handleChange}
                  className={inputClassName}
                >
                  <option value="">パッケージ商品を選択</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.package_code || "-"} / {p.name || "-"}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="販売価格" required>
              <input
                name="sales_price"
                value={form.sales_price}
                onChange={handleChange}
                className={inputClassName}
              />
            </Field>
            <Field label="適用開始日">
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                className={inputClassName}
              />
            </Field>
            <Field label="適用終了日">
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                className={inputClassName}
              />
            </Field>
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/sales-prices")}
              className="rounded-lg border px-6 py-3 text-sm font-bold"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-bold text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
