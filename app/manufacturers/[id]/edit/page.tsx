"use client";

import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function EditManufacturerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    company_type: "メーカー",
    contact_name: "",
    phone: "",
    email: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    supabase
      .from("manufacturers")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          alert("メーカーを取得できませんでした");
          router.push("/manufacturers");
          return;
        }
        setForm({
          name: (data.name as string) || "",
          company_type: (data.company_type as string) || "メーカー",
          contact_name: (data.contact_name as string) || "",
          phone: (data.phone as string) || "",
          email: (data.email as string) || "",
          memo: (data.memo as string) || "",
          is_active: Boolean(data.is_active),
        });
        setLoading(false);
      });
  }, [id, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("manufacturers")
      .update({
        name: form.name,
        company_type: form.company_type,
        contact_name: form.contact_name,
        phone: form.phone,
        email: form.email,
        memo: form.memo,
        is_active: form.is_active,
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      alert("更新に失敗しました：" + error.message);
      return;
    }
    router.push(`/manufacturers/${id}`);
    router.refresh();
  }

  if (loading) {
    return <main className="p-8 text-sm text-gray-500">読み込み中...</main>;
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">メーカー編集</h1>
      </header>
      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">メーカー名 *</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">種別</span>
              <select
                value={form.company_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company_type: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>メーカー</option>
                <option>メーカー直</option>
                <option>その他</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">担当者</span>
              <input
                value={form.contact_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact_name: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">電話番号</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-bold">メール</span>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, is_active: e.target.checked }))
                }
              />
              有効
            </label>
          </div>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/manufacturers")}
              className="rounded-lg border px-6 py-3 text-sm font-bold"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
