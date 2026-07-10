"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Dealer = {
  id: string;
  name: string | null;
};

type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: any;
};

export default function NewSalesPricePage() {
  const router = useRouter();

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    dealer_id: "",
    product_id: "",
    sales_price: "",
    start_date: "",
    end_date: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    async function fetchData() {
      const { data: dealerData } = await supabase
        .from("dealers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      const { data: productData } = await supabase
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
        .order("created_at", { ascending: false });

      setDealers(dealerData || []);
      setProducts((productData as Product[]) || []);
    }

    fetchData();
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.dealer_id) {
      alert("販売店を選択してください");
      return;
    }

    if (!form.product_id) {
      alert("商品を選択してください");
      return;
    }

    if (!form.sales_price) {
      alert("販売価格を入力してください");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("sales_prices").insert({
      dealer_id: form.dealer_id,
      product_id: form.product_id,
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

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">販売価格登録</h1>
        <p className="text-sm text-gray-500">
          販売店ごとの商品販売価格を登録します
        </p>
      </header>

      <main className="p-8">
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