"use client";

import { FormEvent, use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SearchableSelect from "@/app/components/masters/SearchableSelect";
import {
  assertNewProductSelectionsActive,
  buildPackageCompositionProductOption,
  filterProductsForPackageLineSelect,
  PRODUCT_INACTIVE_SELECT_MESSAGE,
} from "@/lib/products/productActiveContract";
import { supabase } from "@/lib/supabase";

type Manufacturer = { id: string; name: string | null };
type Series = { id: string; name: string | null; manufacturer_id: string };
type Supplier = { id: string; name: string | null };
type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  manufacturer_id: string | null;
  category: string | null;
  is_active: unknown;
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [initialProductIds, setInitialProductIds] = useState<Set<string>>(
    () => new Set()
  );
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
    default_supplier_id: "",
  });
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "1" }]);

  useEffect(() => {
    async function load() {
      const [m, s, p, pkg, items, suppliersRes] = await Promise.all([
        supabase.from("manufacturers").select("id, name").eq("is_active", true).order("name"),
        supabase.from("product_series").select("id, name, manufacturer_id").eq("is_active", true).order("name"),
        supabase.from("products").select("id, name, model_no, manufacturer_id, category, is_active").order("name"),
        supabase.from("packages").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("package_items")
          .select("id, product_id, quantity")
          .eq("package_id", id)
          .order("sort_order"),
        supabase.from("suppliers").select("id, name, is_active").order("name"),
      ]);

      setManufacturers((m.data as Manufacturer[]) || []);
      setSeriesList((s.data as Series[]) || []);
      setProducts((p.data as Product[]) || []);

      if (!pkg.data) {
        alert("パッケージを取得できませんでした");
        router.push("/packages");
        return;
      }

      const row = pkg.data;
      const currentSupplierId = (row.default_supplier_id as string | null) || "";
      const supplierRows = (suppliersRes.data || []) as {
        id: string;
        name: string | null;
        is_active: unknown;
      }[];
      setSuppliers(
        supplierRows
          .filter(
            (s) =>
              s.id === currentSupplierId ||
              s.is_active === true ||
              s.is_active === "true" ||
              s.is_active == null
          )
          .map((s) => ({ id: s.id, name: s.name }))
      );
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
        default_supplier_id: currentSupplierId,
      });
      const loadedLines =
        (items.data || []).length > 0
          ? (items.data || []).map((it) => ({
              id: it.id as string,
              product_id: (it.product_id as string) || "",
              quantity: String(it.quantity ?? 1),
            }))
          : [{ product_id: "", quantity: "1" }];
      setLines(loadedLines);
      setInitialProductIds(
        new Set(
          loadedLines
            .map((line) => line.product_id)
            .filter((productId): productId is string => Boolean(productId))
        )
      );
      setLoading(false);
    }
    load();
  }, [id, router]);

  const filteredSeries = useMemo(
    () => seriesList.filter((s) => s.manufacturer_id === form.manufacturer_id),
    [seriesList, form.manufacturer_id]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    const isActiveById = new Map(
      products.map((product) => [product.id, product.is_active] as const)
    );
    const guard = assertNewProductSelectionsActive(
      validLines.map((line) => line.product_id),
      isActiveById,
      initialProductIds
    );
    if (!guard.ok) {
      alert(guard.message || PRODUCT_INACTIVE_SELECT_MESSAGE);
      return;
    }

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
        default_supplier_id: form.default_supplier_id || null,
      })
      .eq("id", id);

    if (error) {
      setSaving(false);
      alert("更新に失敗しました：" + error.message);
      return;
    }

    await supabase.from("package_items").delete().eq("package_id", id);
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
    router.push(`/packages/${id}`);
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
            <Field label="標準仕入先">
              <select
                value={form.default_supplier_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_supplier_id: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option value="">未設定</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "名称未設定"}
                  </option>
                ))}
              </select>
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
              {lines.map((line, index) => {
                const lineProducts = filterProductsForPackageLineSelect(
                  products,
                  line.product_id,
                  form.manufacturer_id
                );
                const productSelectOptions = lineProducts.map((p) =>
                  buildPackageCompositionProductOption({
                    id: p.id,
                    name: p.name || "",
                    model_no: p.model_no,
                    category: p.category,
                    is_active: p.is_active,
                  })
                );
                return (
                  <div
                    key={index}
                    className="grid gap-3 md:grid-cols-[1fr_120px_80px]"
                  >
                    <SearchableSelect
                      options={productSelectOptions}
                      value={line.product_id}
                      onChange={(selectedId) =>
                        setLines((rows) =>
                          rows.map((r, i) =>
                            i === index ? { ...r, product_id: selectedId } : r
                          )
                        )
                      }
                      placeholder="型番・商品名で検索"
                      unsetLabel="商品を検索して選択"
                    />
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
                );
              })}
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
              onClick={() => router.push(`/packages/${id}`)}
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
