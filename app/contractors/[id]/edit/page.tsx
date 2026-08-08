"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

export default function EditContractorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("contractors")
        .select(
          "id, name, postal_code, address, phone, delivery_name, delivery_address, delivery_phone, receiver_name, memo, is_active"
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (fetchError || !data) {
        setError(fetchError?.message || "施工店が見つかりません");
        setLoading(false);
        return;
      }
      setForm({
        name: (data.name as string) || "",
        postal_code: (data.postal_code as string) || "",
        address: (data.address as string) || "",
        phone: (data.phone as string) || "",
        delivery_name: (data.delivery_name as string) || "",
        delivery_address: (data.delivery_address as string) || "",
        delivery_phone: (data.delivery_phone as string) || "",
        receiver_name: (data.receiver_name as string) || "",
        memo: (data.memo as string) || "",
        is_active: Boolean(data.is_active),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("施工店名を入力してください");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("contractors")
      .update({
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
      })
      .eq("id", id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/contractors");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="p-8 text-sm text-gray-600">
        <h1 className="text-xl font-bold text-gray-900">施工店編集</h1>
        <p className="mt-4">読み込み中...</p>
      </main>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">施工店編集</h1>
        <p className="text-sm text-gray-500">
          無効化で一覧の運用停止ができます（削除はしません）
        </p>
      </header>

      <form onSubmit={onSubmit} className="p-8" noValidate>
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
              disabled={saving}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
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
