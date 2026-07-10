"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Dealer = {
  id: string;
  name: string | null;
};

export default function NewCasePage() {
  const router = useRouter();

  const [dealers, setDealers] = useState<Dealer[]>([]);

  const [form, setForm] = useState({
    case_no: "",
    dealer_id: "",
    customer_name: "",
    customer_phone: "",
    site_address: "",
    order_type: "材工発注",
    product_name: "",
    quantity: "1",
    desired_delivery_date: "",
    delivery_address: "",
    construction_desired_date: "",
    construction_detail: "",
    assigned_user: "",
    memo: "",
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchDealers() {
      const { data, error } = await supabase
        .from("dealers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        alert("販売店取得エラー：" + error.message);
        return;
      }

      setDealers(data || []);
    }

    fetchDealers();
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

    setLoading(true);

    const { error } = await supabase.from("cases").insert({
      ...form,
      quantity: Number(form.quantity),
      case_no: form.case_no || `VE-${Date.now()}`,
      desired_delivery_date: form.desired_delivery_date || null,
      construction_desired_date: form.construction_desired_date || null,
    });

    setLoading(false);

    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }

    router.push("/cases");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">案件登録</h1>
        <p className="text-sm text-gray-500">卸案件を新規登録します</p>
      </header>

      <form onSubmit={handleSubmit} className="p-8">
        <div className="max-w-4xl rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="案件番号">
              <input
                name="case_no"
                value={form.case_no}
                onChange={handleChange}
                placeholder="空欄なら自動採番"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

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

            <Field label="顧客名">
              <input
                name="customer_name"
                value={form.customer_name}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="電話番号">
              <input
                name="customer_phone"
                value={form.customer_phone}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="発注区分">
              <select
                name="order_type"
                value={form.order_type}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>材料のみ</option>
                <option>材工発注</option>
                <option>工事のみ</option>
                <option>見積相談</option>
              </select>
            </Field>

            <Field label="商品名">
              <input
                name="product_name"
                value={form.product_name}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="数量">
              <input
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                type="number"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="希望納期">
              <input
                name="desired_delivery_date"
                value={form.desired_delivery_date}
                onChange={handleChange}
                type="date"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="工事希望日">
              <input
                name="construction_desired_date"
                value={form.construction_desired_date}
                onChange={handleChange}
                type="date"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="担当者">
              <input
                name="assigned_user"
                value={form.assigned_user}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-5">
            <Field label="施工先住所">
              <input
                name="site_address"
                value={form.site_address}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="配送先">
              <input
                name="delivery_address"
                value={form.delivery_address}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="工事内容">
              <textarea
                name="construction_detail"
                value={form.construction_detail}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

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

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/cases")}
              className="rounded-lg border px-5 py-3 text-sm font-bold text-gray-700"
            >
              キャンセル
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "登録中..." : "登録する"}
            </button>
          </div>
        </div>
      </form>
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