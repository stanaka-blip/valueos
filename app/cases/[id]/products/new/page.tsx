"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: any;
};

type Supplier = {
  id: string;
  name: string | null;
};

export default function NewCaseProductPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.id as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [form, setForm] = useState({
    product_id: "",
    supplier_id: "",
    quantity: "1",
    purchase_price: "",
    sales_price: "",
    memo: "",
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data: productData } = await supabase
        .from("products")
        .select(`
          id,
          name,
          model_no,
          category,
          manufacturers (name)
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      const { data: supplierData } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      setProducts((productData as Product[]) || []);
      setSuppliers(supplierData || []);
    }

    fetchData();
  }, []);

  useEffect(() => {
  async function fetchPrice() {
    if (!form.product_id || !form.supplier_id) return;

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("purchase_prices")
      .select("purchase_price")
      .eq("product_id", form.product_id)
      .eq("supplier_id", form.supplier_id)
      .eq("is_active", true)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("start_date", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.log("価格取得なし", error.message);
      return;
    }

    setForm((prev) => ({
      ...prev,
      purchase_price: data?.purchase_price
        ? String(data.purchase_price)
        : prev.purchase_price,
    }));
  }

  fetchPrice();
}, [form.product_id, form.supplier_id]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const quantity = Number(form.quantity);
    const purchasePrice = Number(form.purchase_price);
    const salesPrice = Number(form.sales_price);
    const grossProfit = salesPrice - purchasePrice;

    setLoading(true);

    const { error } = await supabase.from("case_products").insert({
      case_id: caseId,
      product_id: form.product_id,
      supplier_id: form.supplier_id,
      quantity,
      purchase_price: purchasePrice,
      sales_price: salesPrice,
      gross_profit: grossProfit,
      memo: form.memo,
    });

    setLoading(false);

    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }

    router.push(`/cases/${caseId}`);
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">案件商品追加</h1>
        <p className="text-sm text-gray-500">案件に商品・仕入先・金額を追加します</p>
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
                    {product.manufacturers?.name || "-"} / {product.category || "-"} /{" "}
                    {product.model_no || "-"} / {product.name || "-"}
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

            <Field label="数量">
              <input
                type="number"
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="仕入価格">
              <input
                type="number"
                name="purchase_price"
                value={form.purchase_price}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="販売価格">
              <input
                type="number"
                name="sales_price"
                value={form.sales_price}
                onChange={handleChange}
                required
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
              onClick={() => router.push(`/cases/${caseId}`)}
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