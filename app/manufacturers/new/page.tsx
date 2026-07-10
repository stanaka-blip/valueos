"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NewManufacturerPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    company_type: "メーカー",
    contact_name: "",
    phone: "",
    email: "",
    memo: "",
    is_active: true,
  });

  const [loading, setLoading] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("manufacturers").insert({
      name: form.name,
      company_type: form.company_type,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      memo: form.memo,
      is_active: form.is_active,
    });

    setLoading(false);

    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }

    router.push("/manufacturers");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">メーカー登録</h1>
        <p className="text-sm text-gray-500">新しいメーカーを登録します</p>
      </header>

      <form onSubmit={handleSubmit} className="p-8">
        <div className="max-w-3xl rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="メーカー名">
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="種別">
              <select
                name="company_type"
                value={form.company_type}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>メーカー</option>
                <option>メーカー直</option>
                <option>その他</option>
              </select>
            </Field>

            <Field label="担当者">
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
              onClick={() => router.push("/manufacturers")}
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