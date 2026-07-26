"use client";

import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Manufacturer = { id: string; name: string | null };

export default function EditSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    manufacturer_id: "",
    name: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    async function load() {
      const [{ data: makers }, { data: row, error }] = await Promise.all([
        supabase
          .from("manufacturers")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("product_series")
          .select("id, manufacturer_id, name, description, is_active")
          .eq("id", id)
          .maybeSingle(),
      ]);
      setManufacturers((makers as Manufacturer[]) || []);
      if (error || !row) {
        alert("シリーズを取得できませんでした");
        router.push("/series");
        return;
      }
      setForm({
        manufacturer_id: (row.manufacturer_id as string) || "",
        name: (row.name as string) || "",
        description: (row.description as string) || "",
        is_active: Boolean(row.is_active),
      });
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("product_series")
      .update({
        manufacturer_id: form.manufacturer_id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      alert("更新に失敗しました：" + error.message);
      return;
    }
    router.push("/series");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="p-8 text-sm text-gray-500">読み込み中...</main>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">シリーズ編集</h1>
      </header>
      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-5">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">
                メーカー *
              </span>
              <select
                value={form.manufacturer_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, manufacturer_id: e.target.value }))
                }
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">
                シリーズ名 *
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">説明</span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
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
              onClick={() => router.push("/series")}
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
