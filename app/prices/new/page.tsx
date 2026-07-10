"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: {
    name: string | null;
  } | null;
};

type Supplier = {
  id: string;
  name: string | null;
};

export default function NewPricePage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [form, setForm] = useState({
    product_id: "",
    supplier_id: "",
    purchase_price: "",
    start_date: "",
    end_date: "",
    memo: "",
    is_active: true,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data: productData, error: productError } = await supabase
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

      if (productError) {
        alert("商品取得エラー：" + productError.message);
        return;
      }

      const { data: supplierData, error: supplierError } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (supplierError) {
        alert("仕入先取得エラー：" + supplierError.message);
        return;
      }

      setProducts((productData as Product[]) || []);
      setSuppliers(supplierData || []);
    }

    fetchData();
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.product_id) {
      alert("商品を選択してください");
      return;
    }

    if (!form.supplier_id) {
      alert("仕入先を選択してください");
      return;
    }

    if (!form.purchase_price) {
      alert("仕入価格を入力してください");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("purchase_prices").insert({
      product_id: form.product_id,
      supplier_id: form.supplier_id,
      purchase_price: Number(form.purchase_price),
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

    router.push("/prices");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">価格登録</h1>
        <p className="text-sm text-gray-500">
          商品ごとの仕入先別価格を登録します
        </p>
      </header>

      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-5xl rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-6 md:grid-cols-2">
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

            <Field label="仕入先">
              <select
                name="supplier_id"
                value={form.supplier_id}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option value="">仕入先を選択</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="仕入価格（税抜）">
              <input
                type="number"
                name="purchase_price"
                value={form.purchase_price}
                onChange={handleChange}
                required
                placeholder="例：815000"
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
              onClick={() => router.push("/prices")}
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