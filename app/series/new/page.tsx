"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Manufacturer = { id: string; name: string | null };

export default function NewSeriesPage() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    manufacturer_id: "",
    name: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    supabase
      .from("manufacturers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setManufacturers((data as Manufacturer[]) || []));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.manufacturer_id || !form.name.trim()) {
      alert("メーカーとシリーズ名は必須です");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("product_series").insert({
      manufacturer_id: form.manufacturer_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
    });
    setLoading(false);
    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }
    router.push("/series");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">シリーズ登録</h1>
        <p className="text-sm text-gray-500">メーカー配下のシリーズを登録します</p>
      </header>
      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block md:col-span-2">
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
                <option value="">メーカーを選択</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
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
            <label className="block md:col-span-2">
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
