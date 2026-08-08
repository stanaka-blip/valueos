"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  isProductActiveFlag,
  matchesProductSearch,
  type ProductListRow,
} from "@/app/products/productListQuery";
import { supabase } from "@/lib/supabase";

import {
  createIdempotencyKey,
  submitPackageBulkSetup,
} from "./submitPackageBulkSetup";

type Manufacturer = { id: string; name: string | null };
type Series = { id: string; name: string | null; manufacturer_id: string };
type Supplier = { id: string; name: string | null };
type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  manufacturer_id: string | null;
  manufacturer_name: string;
  is_active: unknown;
};

type ItemDraft = {
  product_id: string;
  quantity: string;
  q: string;
};

type PackageDraft = {
  key: string;
  name: string;
  capacity: string;
  warranty_years: string;
  default_supplier_id: string;
  memo: string;
  is_active: boolean;
  expanded: boolean;
  items: ItemDraft[];
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900";

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPackage(): PackageDraft {
  return {
    key: newKey(),
    name: "",
    capacity: "",
    warranty_years: "",
    default_supplier_id: "",
    memo: "",
    is_active: true,
    expanded: true,
    items: [{ product_id: "", quantity: "1", q: "" }],
  };
}

export default function PackageBulkPage() {
  const router = useRouter();
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [manufacturerId, setManufacturerId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [showOtherMakers, setShowOtherMakers] = useState(false);
  const [rows, setRows] = useState<PackageDraft[]>([emptyPackage()]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      const [mRes, sRes, pRes, supRes] = await Promise.all([
        supabase
          .from("manufacturers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("product_series")
          .select("id, name, manufacturer_id")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select(
            `
            id,
            name,
            model_no,
            manufacturer_id,
            is_active,
            manufacturers ( name )
          `
          )
          .order("model_no", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id, name, is_active")
          .order("name", { ascending: true }),
      ]);

      if (mRes.error || sRes.error || pRes.error || supRes.error) {
        setLoadError(
          mRes.error?.message ||
            sRes.error?.message ||
            pRes.error?.message ||
            supRes.error?.message ||
            "マスタ取得に失敗しました"
        );
        setLoading(false);
        return;
      }

      setManufacturers((mRes.data || []) as Manufacturer[]);
      setSeriesList((sRes.data || []) as Series[]);
      setProducts(
        ((pRes.data || []) as Array<Record<string, unknown>>)
          .map((row) => {
            const makers = row.manufacturers as
              | { name: string | null }
              | { name: string | null }[]
              | null;
            const maker = Array.isArray(makers) ? makers[0] : makers;
            return {
              id: String(row.id),
              name: (row.name as string | null) || null,
              model_no: (row.model_no as string | null) || null,
              manufacturer_id: (row.manufacturer_id as string | null) || null,
              manufacturer_name: maker?.name?.trim() || "",
              is_active: row.is_active,
            };
          })
          .filter((p) => isProductActiveFlag(p.is_active))
      );
      setSuppliers(
        ((supRes.data || []) as {
          id: string;
          name: string | null;
          is_active: unknown;
        }[])
          .filter(
            (s) =>
              s.is_active === true ||
              s.is_active === "true" ||
              s.is_active == null
          )
          .map((s) => ({ id: s.id, name: s.name }))
      );
      setLoading(false);
    }
    load();
  }, []);

  const filteredSeries = useMemo(
    () => seriesList.filter((s) => s.manufacturer_id === manufacturerId),
    [seriesList, manufacturerId]
  );

  const candidateProducts = useMemo(() => {
    if (!manufacturerId) return [];
    return products.filter(
      (p) => showOtherMakers || p.manufacturer_id === manufacturerId
    );
  }, [products, manufacturerId, showOtherMakers]);

  function productOptions(q: string): Product[] {
    const listRows: ProductListRow[] = candidateProducts.map((p) => ({
      id: p.id,
      name: p.name,
      category: null,
      model_no: p.model_no,
      is_active: p.is_active,
      manufacturer_id: p.manufacturer_id,
      manufacturerName: p.manufacturer_name,
    }));
    return listRows
      .filter((row) => matchesProductSearch(row, q))
      .slice(0, 80)
      .map((row) => candidateProducts.find((p) => p.id === row.id)!)
      .filter(Boolean);
  }

  function patchRow(key: string, patch: Partial<PackageDraft>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  function patchItem(
    packageKey: string,
    itemIndex: number,
    patch: Partial<ItemDraft>
  ) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== packageKey) return r;
        const items = r.items.map((item, i) =>
          i === itemIndex ? { ...item, ...patch } : item
        );
        return { ...r, items };
      })
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitError("");

    if (!manufacturerId) {
      setSubmitError("メーカーを選択してください。");
      return;
    }

    const packages = rows.map((r) => ({
      name: r.name.trim(),
      capacity: r.capacity ? Number(r.capacity) : null,
      capacity_unit: "kWh",
      warranty_years: r.warranty_years ? Number(r.warranty_years) : null,
      default_supplier_id: r.default_supplier_id || null,
      memo: r.memo.trim() || null,
      is_active: r.is_active,
      items: r.items
        .filter((i) => i.product_id && Number(i.quantity) > 0)
        .map((i) => ({
          product_id: i.product_id,
          quantity: Number(i.quantity),
        })),
    }));

    if (packages.some((p) => !p.name)) {
      setSubmitError("パッケージ名を入力してください。");
      return;
    }
    if (packages.some((p) => p.items.length === 0)) {
      setSubmitError("各パッケージに構成商品を1件以上設定してください。");
      return;
    }

    setSubmitting(true);
    const result = await submitPackageBulkSetup({
      body: {
        manufacturer_id: manufacturerId,
        series_id: seriesId || null,
        packages,
      },
      idempotencyKey: idempotencyKeyRef.current,
    });
    setSubmitting(false);

    if (!result.ok) {
      idempotencyKeyRef.current = createIdempotencyKey();
      const fieldMsg = result.field_errors
        ? Object.values(result.field_errors)[0]
        : "";
      setSubmitError(fieldMsg || result.error_message);
      return;
    }

    router.push("/packages");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="p-8">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              パッケージ一括登録
            </h1>
            <p className="text-sm text-gray-500">
              メーカー・シリーズを選び、複数パッケージと構成商品をまとめて登録します（途中失敗時はすべて取り消されます）
            </p>
          </div>
          <Link
            href="/packages"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            一覧へ戻る
          </Link>
        </div>
      </header>

      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-7xl space-y-6 rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">メーカー *</span>
              <select
                value={manufacturerId}
                onChange={(e) => {
                  setManufacturerId(e.target.value);
                  setSeriesId("");
                  setShowOtherMakers(false);
                }}
                className={inputClass}
                required
              >
                <option value="">選択してください</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">シリーズ</span>
              <select
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
                className={inputClass}
                disabled={!manufacturerId}
              >
                <option value="">未設定（任意）</option>
                {filteredSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showOtherMakers}
                onChange={(e) => setShowOtherMakers(e.target.checked)}
                disabled={!manufacturerId}
              />
              他メーカー商品も表示
            </label>
          </div>

          <div className="space-y-4">
            {rows.map((row, rowIndex) => (
              <div
                key={row.key}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-gray-900">
                    パッケージ {rowIndex + 1}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700"
                      onClick={() =>
                        patchRow(row.key, { expanded: !row.expanded })
                      }
                    >
                      {row.expanded ? "構成を閉じる" : "構成を開く"}
                    </button>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-red-700"
                        onClick={() =>
                          setRows((prev) =>
                            prev.filter((r) => r.key !== row.key)
                          )
                        }
                      >
                        行削除
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <label className="block space-y-1 lg:col-span-2">
                    <span className="text-sm font-medium text-gray-700">
                      パッケージ名 *
                    </span>
                    <input
                      value={row.name}
                      onChange={(e) =>
                        patchRow(row.key, { name: e.target.value })
                      }
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-gray-700">
                      容量 (kWh)
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      value={row.capacity}
                      onChange={(e) =>
                        patchRow(row.key, { capacity: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-gray-700">
                      保証（年）
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={row.warranty_years}
                      onChange={(e) =>
                        patchRow(row.key, { warranty_years: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-gray-700">
                      標準仕入先
                    </span>
                    <select
                      value={row.default_supplier_id}
                      onChange={(e) =>
                        patchRow(row.key, {
                          default_supplier_id: e.target.value,
                        })
                      }
                      className={inputClass}
                    >
                      <option value="">未設定</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-gray-700">メモ</span>
                    <input
                      value={row.memo}
                      onChange={(e) =>
                        patchRow(row.key, { memo: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(e) =>
                        patchRow(row.key, { is_active: e.target.checked })
                      }
                    />
                    有効
                  </label>
                </div>

                {row.expanded ? (
                  <div className="mt-4 space-y-3 rounded-lg bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-700">
                      構成商品 *
                    </p>
                    {row.items.map((item, itemIndex) => {
                      const options = productOptions(item.q);
                      const selected = products.find(
                        (p) => p.id === item.product_id
                      );
                      return (
                        <div
                          key={`${row.key}-item-${itemIndex}`}
                          className="grid gap-2 md:grid-cols-12"
                        >
                          <label className="block space-y-1 md:col-span-4">
                            <span className="text-xs text-gray-500">
                              商品検索（型番・商品名）
                            </span>
                            <input
                              value={item.q}
                              onChange={(e) =>
                                patchItem(row.key, itemIndex, {
                                  q: e.target.value,
                                })
                              }
                              className={inputClass}
                              placeholder="型番や商品名で絞り込み"
                              disabled={!manufacturerId}
                            />
                          </label>
                          <label className="block space-y-1 md:col-span-5">
                            <span className="text-xs text-gray-500">商品 *</span>
                            <select
                              value={item.product_id}
                              onChange={(e) =>
                                patchItem(row.key, itemIndex, {
                                  product_id: e.target.value,
                                })
                              }
                              className={inputClass}
                              disabled={!manufacturerId}
                            >
                              <option value="">選択してください</option>
                              {selected &&
                              !options.some((o) => o.id === selected.id) ? (
                                <option value={selected.id}>
                                  {selected.model_no || "—"} /{" "}
                                  {selected.name || "—"}
                                  {selected.manufacturer_name
                                    ? `（${selected.manufacturer_name}）`
                                    : ""}
                                </option>
                              ) : null}
                              {options.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.model_no || "—"} / {p.name || "—"}
                                  {showOtherMakers && p.manufacturer_name
                                    ? `（${p.manufacturer_name}）`
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block space-y-1 md:col-span-2">
                            <span className="text-xs text-gray-500">数量 *</span>
                            <input
                              type="number"
                              min={1}
                              step="1"
                              value={item.quantity}
                              onChange={(e) =>
                                patchItem(row.key, itemIndex, {
                                  quantity: e.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </label>
                          <div className="flex items-end md:col-span-1">
                            {row.items.length > 1 ? (
                              <button
                                type="button"
                                className="w-full rounded border border-gray-300 px-2 py-2 text-xs text-red-700"
                                onClick={() =>
                                  patchRow(row.key, {
                                    items: row.items.filter(
                                      (_, i) => i !== itemIndex
                                    ),
                                  })
                                }
                              >
                                削除
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700"
                      onClick={() =>
                        patchRow(row.key, {
                          items: [
                            ...row.items,
                            { product_id: "", quantity: "1", q: "" },
                          ],
                        })
                      }
                    >
                      ＋ 構成商品を追加
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">
                    構成商品 {row.items.filter((i) => i.product_id).length} 件
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            onClick={() => setRows((prev) => [...prev, emptyPackage()])}
          >
            ＋ パッケージ行を追加
          </button>

          {submitError ? (
            <p className="text-sm text-red-600">{submitError}</p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/packages"
              className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting || !manufacturerId || rows.length === 0}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? "登録中..." : "一括登録"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
