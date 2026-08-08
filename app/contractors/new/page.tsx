"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { supabase } from "@/lib/supabase";

type FormState = {
  name: string;
  postal_code: string;
  address: string;
  phone: string;
  delivery_name: string;
  delivery_address: string;
  delivery_phone: string;
  receiver_name: string;
  memo: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  name: "",
  postal_code: "",
  address: "",
  phone: "",
  delivery_name: "",
  delivery_address: "",
  delivery_phone: "",
  receiver_name: "",
  memo: "",
  is_active: true,
};

export default function NewContractorPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("施工店名を入力してください");
      return;
    }

    setLoading(true);
    const { error: insertError } = await supabase.from("contractors").insert({
      name: form.name.trim(),
      postal_code: form.postal_code.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      delivery_name: form.delivery_name.trim() || null,
      delivery_address: form.delivery_address.trim() || null,
      delivery_phone: form.delivery_phone.trim() || null,
      receiver_name: form.receiver_name.trim() || null,
      memo: form.memo.trim() || null,
      is_active: form.is_active,
    });
    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/contractors");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">施工店登録</h1>
        <p className="text-sm text-gray-500">
          施工店所在地と標準納品先情報を登録します
        </p>
      </header>

      <form onSubmit={handleSubmit} className="p-8" noValidate>
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="施工店名" required className="md:col-span-2">
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="郵便番号">
              <input
                value={form.postal_code}
                onChange={(e) => setField("postal_code", e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
                placeholder="例：100-0001"
              />
            </Field>

            <Field label="電話番号">
              <input
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="住所（施工店所在地）" className="md:col-span-2">
              <input
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                設置先住所とは別です。施工店の所在地を入力してください。
              </p>
            </Field>

            <Field label="納品先名称" className="md:col-span-2">
              <input
                value={form.delivery_name}
                onChange={(e) => setField("delivery_name", e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="納品先住所" className="md:col-span-2">
              <input
                value={form.delivery_address}
                onChange={(e) => setField("delivery_address", e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="納品先電話番号">
              <input
                value={form.delivery_phone}
                onChange={(e) => setField("delivery_phone", e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="荷受け担当者">
              <input
                value={form.receiver_name}
                onChange={(e) => setField("receiver_name", e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="メモ" className="md:col-span-2">
              <textarea
                value={form.memo}
                onChange={(e) => setField("memo", e.target.value)}
                rows={4}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
              />
              有効
            </label>
          </div>

          {error ? (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          ) : null}

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/contractors")}
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
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <p className="mb-2 text-sm font-bold text-gray-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </p>
      {children}
    </label>
  );
}
