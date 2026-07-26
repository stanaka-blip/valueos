"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PRICE_TARGET_OPTIONS,
  type PriceTargetType,
} from "@/lib/prices/targetType";

type Dealer = {
  id: string;
  name: string | null;
};

type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: { name: string | null } | null;
};

type PackageRow = {
  id: string;
  name: string | null;
  package_code: string | null;
  capacity: number | string | null;
  capacity_unit: string | null;
  system_type: string | null;
  manufacturers: { name: string | null } | null;
};

export default function NewSalesPricePage() {
  const router = useRouter();

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

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
    async function fetchData() {
      setLoadError("");
      const [
        { data: dealerData, error: dealerError },
        { data: productData, error: productError },
        { data: packageData, error: packageError },
      ] = await Promise.all([
        supabase
          .from("dealers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select(
            `
            id,
            name,
            model_no,
            category,
            manufacturers (
              name
            )
          `
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("packages")
          .select(
            `
            id,
            name,
            package_code,
            capacity,
            capacity_unit,
            system_type,
            manufacturers (
              name
            )
          `
          )
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      if (dealerError || productError || packageError) {
        setLoadError(
          dealerError?.message ||
            productError?.message ||
            packageError?.message ||
            "データ取得に失敗しました"
        );
        return;
      }

      setDealers(dealerData || []);
      setProducts(((productData || []) as unknown as Product[]));
      setPackages(((packageData || []) as unknown as PackageRow[]));
    }

    fetchData();
  }, []);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = e.target;

    if (name === "price_target_type") {
      setForm((current) => ({
        ...current,
        price_target_type: value as PriceTargetType,
        product_id: "",
        package_id: "",
      }));
      return;
    }

    const target = e.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      setForm((current) => ({
        ...current,
        [name]: target.checked,
      }));
      return;
    }

    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.dealer_id) {
      alert("販売店を選択してください");
      return;
    }

    const isProduct = form.price_target_type === "PRODUCT";
    if (isProduct && !form.product_id) {
      alert("商品を選択してください");
      return;
    }
    if (!isProduct && !form.package_id) {
      alert("パッケージ商品を選択してください");
      return;
    }

    if (!form.sales_price) {
      alert("販売価格を入力してください");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("sales_prices").insert({
      dealer_id: form.dealer_id,
      price_target_type: form.price_target_type,
      product_id: isProduct ? form.product_id : null,
      package_id: isProduct ? null : form.package_id,
      sales_price: Number(form.sales_price),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      memo: form.memo,
      is_active: form.is_active,
    });

    setLoading(false);

    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }

    router.push("/sales-prices");
    router.refresh();
  }

  const isProduct = form.price_target_type === "PRODUCT";

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">販売価格登録</h1>
        <p className="text-sm text-gray-500">
          販売店ごとの商品・パッケージ販売価格を登録します
        </p>
      </header>

      <main className="p-8">
        {loadError ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-5xl rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="販売店">
              <select
                name="dealer_id"
                value={form.dealer_id}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option value="">販売店を選択</option>
                {dealers.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="価格対象">
              <select
                name="price_target_type"
                value={form.price_target_type}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                {PRICE_TARGET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>

            {isProduct ? (
              <Field label="商品">
                <select
                  name="product_id"
                  value={form.product_id}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                >
                  <option value="">商品を選択</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.manufacturers?.name || "-"} /{" "}
                      {product.category || "-"} / {product.model_no || "-"} /{" "}
                      {product.name || "-"}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="パッケージ商品">
                <select
                  name="package_id"
                  value={form.package_id}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                >
                  <option value="">パッケージ商品を選択</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.manufacturers?.name || "-"} /{" "}
                      {pkg.system_type || "-"} /{" "}
                      {pkg.capacity != null
                        ? `${pkg.capacity}${pkg.capacity_unit || ""}`
                        : "-"}{" "}
                      / {pkg.package_code || "-"} / {pkg.name || "-"}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="販売価格（税抜）">
              <input
                type="number"
                name="sales_price"
                value={form.sales_price}
                onChange={handleChange}
                required
                placeholder="例：1380000"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="適用開始日">
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="適用終了日">
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-6">
            <Field label="備考">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-8 flex gap-4">
            <button
              type="button"
              onClick={() => router.push("/sales-prices")}
              className="rounded-lg border px-6 py-3 text-sm font-bold text-gray-700"
            >
              キャンセル
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "登録中..." : "登録する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-gray-700">{label}</p>
      {children}
    </label>
  );
}
