"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NewSupplierPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    supplier_type: "商社",
    contact_name: "",
    phone: "",
    email: "",
    order_method: "",
    closing_day: "",
    payment_site: "",
    credit_limit: "",
    memo: "",
    is_active: true,
  });

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

    setLoading(true);

    const { error } = await supabase.from("suppliers").insert({
      name: form.name,
      supplier_type: form.supplier_type,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      order_method: form.order_method,
      closing_day: form.closing_day,
      payment_site: form.payment_site,
      credit_limit:
        form.credit_limit === ""
          ? null
          : Number(form.credit_limit),
      memo: form.memo,
      is_active: form.is_active,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/suppliers");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold">仕入先登録</h1>
        <p className="text-gray-500">
          商社・メーカー直を登録します
        </p>
      </header>

      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-5xl rounded-xl bg-white p-8 shadow"
        >
          <div className="grid gap-6 md:grid-cols-2">

            <Field label="仕入先名">
              <input
                required
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              />
            </Field>

            <Field label="種別">
              <select
                name="supplier_type"
                value={form.supplier_type}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              >
                <option>商社</option>
                <option>メーカー直</option>
                <option>その他</option>
              </select>
            </Field>

            <Field label="担当者">
              <input
                name="contact_name"
                value={form.contact_name}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              />
            </Field>

            <Field label="電話番号">
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              />
            </Field>

            <Field label="メール">
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              />
            </Field>

            <Field label="発注方法">
              <select
                name="order_method"
                value={form.order_method}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              >
                <option value="">選択してください</option>
                <option>メール</option>
                <option>FAX</option>
                <option>Web</option>
                <option>担当者へ連絡</option>
              </select>
            </Field>

            <Field label="締日">
              <select
                name="closing_day"
                value={form.closing_day}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              >
                <option value="">選択してください</option>
                <option>15日</option>
                <option>20日</option>
                <option>25日</option>
                <option>末日</option>
              </select>
            </Field>

            <Field label="支払サイト">
              <select
                name="payment_site"
                value={form.payment_site}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              >
                <option value="">選択してください</option>
                <option>当月末</option>
                <option>翌月末</option>
                <option>翌々月末</option>
                <option>60日</option>
              </select>
            </Field>

            <Field label="買掛上限（円）">
              <input
                type="number"
                name="credit_limit"
                value={form.credit_limit}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              />
            </Field>

          </div>

          <div className="mt-6">
            <Field label="備考">
              <textarea
                rows={4}
                name="memo"
                value={form.memo}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              />
            </Field>
          </div>

          <div className="mt-8 flex gap-4">
            <button
              type="button"
              onClick={() => router.push("/suppliers")}
              className="rounded-lg border px-6 py-3"
            >
              キャンセル
            </button>

            <button
              disabled={loading}
              className="rounded-lg bg-gray-900 px-6 py-3 font-bold text-white"
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
      <div className="mb-2 font-semibold">{label}</div>
      {children}
    </label>
  );
}