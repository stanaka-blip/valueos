"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NewDealerPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    payment_type: "売掛",
    credit_limit: "",
    sales_person: "",
    memo: "",
    is_active: true,
  });

  const [loading, setLoading] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
e.preventDefault();
alert("登録処理が動きました");


    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("dealers").insert({
      name: form.name,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      payment_type: form.payment_type,
      credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
      sales_person: form.sales_person,
      memo: form.memo,
      is_active: form.is_active,
    });

    setLoading(false);

    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }

    router.push("/dealers");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">販売店登録</h1>
        <p className="text-sm text-gray-500">新しい販売店を登録します</p>
      </header>

      <form onSubmit={handleSubmit} className="p-8">
        <div className="max-w-3xl rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="販売店名">
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="担当者名">
              <input
                name="contact_name"
                value={form.contact_name}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="電話番号">
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="メール">
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="住所">
              <input
                name="address"
                value={form.address}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="決済条件">
              <select
                name="payment_type"
                value={form.payment_type}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>売掛</option>
                <option>前金</option>
                <option>三社間決済</option>
                <option>その他</option>
              </select>
            </Field>

            <Field label="売掛上限">
              <input
                name="credit_limit"
                value={form.credit_limit}
                onChange={handleChange}
                type="number"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="担当営業">
              <input
                name="sales_person"
                value={form.sales_person}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-5">
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
              onClick={() => router.push("/dealers")}
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