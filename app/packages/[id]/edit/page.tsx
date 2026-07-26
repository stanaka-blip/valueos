"use client";

import { FormEvent, use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Manufacturer = { id: string; name: string | null };
type Series = { id: string; name: string | null; manufacturer_id: string };
type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  manufacturer_id: string | null;
};
type Line = { id?: string; product_id: string; quantity: string };

export default function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    manufacturer_id: "",
    series_id: "",
    name: "",
    package_code: "",
    capacity: "",
    capacity_unit: "kWh",
    system_type: "",
    warranty_years: "",
    memo: "",
    is_active: true,
  });
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "1" }]);

  useEffect(() => {
    async function load() {
      const [m, s, p, pkg, items] = await Promise.all([
        supabase.from("manufacturers").select("id, name").eq("is_active", true).order("name"),
        supabase.from("product_series").select("id, name, manufacturer_id").eq("is_active", true).order("name"),
        supabase.from("products").select("id, name, model_no, manufacturer_id, is_active").order("name"),
        supabase.from("packages").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("package_items")
          .select("id, product_id, quantity")
          .eq("package_id", id)
          .order("sort_order"),
      ]);

      setManufacturers((m.data as Manufacturer[]) || []);
      setSeriesList((s.data as Series[]) || []);
      setProducts(
        ((p.data as (Product & { is_active: boolean | string | null })[]) || []).filter(
          (row) => row.is_active === true || row.is_active === "true"
        )
      );

      if (!pkg.data) {
        alert("パッケージを取得できませんでした");
        router.push("/packages");
        return;
      }

      const row = pkg.data;
      setForm({
        manufacturer_id: (row.manufacturer_id as string) || "",
        series_id: (row.series_id as string) || "",
        name: (row.name as string) || "",
        package_code: (row.package_code as string) || "",
        capacity: row.capacity != null ? String(row.capacity) : "",
        capacity_unit: (row.capacity_unit as string) || "kWh",
        system_type: (row.system_type as string) || "",
        warranty_years:
          row.warranty_years != null ? String(row.warranty_years) : "",
        memo: (row.memo as string) || "",
        is_active: Boolean(row.is_active),
      });
      setLines(
        (items.data || []).length > 0
          ? (items.data || []).map((it) => ({
              id: it.id as string,
              product_id: (it.product_id as string) || "",
              quantity: String(it.quantity ?? 1),
            }))
          : [{ product_id: "", quantity: "1" }]
      );
      setLoading(false);
    }
    load();
  }, [id, router]);

  const filteredSeries = useMemo(
    () => seriesList.filter((s) => s.manufacturer_id === form.manufacturer_id),
    [seriesList, form.manufacturer_id]
  );
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) => !form.manufacturer_id || p.manufacturer_id === form.manufacturer_id
      ),
    [products, form.manufacturer_id]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("packages")
      .update({
        manufacturer_id: form.manufacturer_id,
        series_id: form.series_id || null,
        name: form.name.trim(),
        package_code: form.package_code.trim() || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        capacity_unit: form.capacity_unit || null,
        system_type: form.system_type.trim() || null,
        warranty_years: form.warranty_years ? Number(form.warranty_years) : null,
        memo: form.memo.trim() || null,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setSaving(false);
      alert("更新に失敗しました：" + error.message);
      return;
    }

    await supabase.from("package_items").delete().eq("package_id", id);
    const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (validLines.length > 0) {
      const { error: itemsError } = await supabase.from("package_items").insert(
        validLines.map((l, i) => ({
          package_id: id,
          product_id: l.product_id,
          quantity: Number(l.quantity),
          requirement_type: "required",
          sort_order: i + 1,
        }))
      );
      if (itemsError) {
        setSaving(false);
        alert("構成商品の更新に失敗しました：" + itemsError.message);
        return;
      }
    }

    setSaving(false);
    router.push("/packages");
    router.refresh();
  }

  if (loading) {
    return <main className="p-8 text-sm text-gray-500">読み込み中...</main>;
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">パッケージ商品編集</h1>
      </header>
      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-5xl space-y-6 rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="メーカー *">
              <select
                value={form.manufacturer_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    manufacturer_id: e.target.value,
                    series_id: "",
                  }))
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
            </Field>
            <Field label="シリーズ">
              <select
                value={form.series_id}
                onChange={(e) => setForm((f) => ({ ...f, series_id: e.target.value }))}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option value="">シリーズを選択（任意）</option>
                {filteredSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="パッケージ名 *">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
            <Field label="保証（年）">
              <input
                type="number"
                value={form.warranty_years}
                onChange={(e) =>
                  setForm((f) => ({ ...f, warranty_years: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
            <Field label="容量">
              <input
                type="number"
                step="0.1"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
            <Field label="システム種別">
              <input
                value={form.system_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, system_type: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">構成商品</h2>
              <button
                type="button"
                onClick={() =>
                  setLines((rows) => [...rows, { product_id: "", quantity: "1" }])
                }
                className="rounded-lg border px-3 py-1.5 text-xs font-bold"
              >
                ＋ 行追加
              </button>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-3 md:grid-cols-[1fr_120px_80px]">
                  <select
                    value={line.product_id}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, product_id: e.target.value } : r
                        )
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="">商品を選択</option>
                    {filteredProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.model_no ? `（${p.model_no}）` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, quantity: e.target.value } : r
                        )
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLines((rows) => rows.filter((_, i) => i !== index))
                    }
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            有効
          </label>

          <div className="flex gap-3 border-t pt-6">
            <button
              type="button"
              onClick={() => router.push("/packages")}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-gray-700">{label}</span>
      {children}
    </label>
  );
}
