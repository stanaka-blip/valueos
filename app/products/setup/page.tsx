"use client";

import {
  FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

import {
  createIdempotencyKey,
  submitProductSetup,
} from "./submitProductSetup";

type Manufacturer = { id: string; name: string | null };
type Series = { id: string; name: string | null; manufacturer_id: string | null };
type Supplier = { id: string; name: string | null };
type Dealer = { id: string; name: string | null };

type PurchaseRow = {
  key: string;
  supplier_id: string;
  purchase_price: string;
  start_date: string;
  end_date: string;
  memo: string;
  is_active: boolean;
};

type SalesRow = {
  key: string;
  dealer_id: string;
  sales_price: string;
  start_date: string;
  end_date: string;
  memo: string;
  is_active: boolean;
};

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyPurchaseRow(): PurchaseRow {
  return {
    key: newKey(),
    supplier_id: "",
    purchase_price: "",
    start_date: "",
    end_date: "",
    memo: "",
    is_active: true,
  };
}

function emptySalesRow(): SalesRow {
  return {
    key: newKey(),
    dealer_id: "",
    sales_price: "",
    start_date: "",
    end_date: "",
    memo: "",
    is_active: true,
  };
}

export default function ProductSetupPage() {
  const router = useRouter();
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [product, setProduct] = useState({
    manufacturer_id: "",
    series_id: "",
    category: "",
    model_no: "",
    name: "",
    capacity: "",
    unit: "",
    memo: "",
    is_active: true,
    default_supplier_id: "",
  });
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([
    emptyPurchaseRow(),
  ]);
  const [salesRows, setSalesRows] = useState<SalesRow[]>([]);

  useEffect(() => {
    async function load() {
      setInitialLoading(true);
      setLoadError("");
      const [mRes, sRes, supplierRes, dealerRes] = await Promise.all([
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
          .from("suppliers")
          .select("id, name, is_active")
          .order("name", { ascending: true }),
        supabase
          .from("dealers")
          .select("id, name, is_active")
          .order("name", { ascending: true }),
      ]);

      if (mRes.error || sRes.error || supplierRes.error || dealerRes.error) {
        setLoadError(
          mRes.error?.message ||
            sRes.error?.message ||
            supplierRes.error?.message ||
            dealerRes.error?.message ||
            "マスタの取得に失敗しました"
        );
        setInitialLoading(false);
        return;
      }

      setManufacturers((mRes.data || []) as Manufacturer[]);
      setSeriesList((sRes.data || []) as Series[]);
      setSuppliers(
        ((supplierRes.data || []) as { id: string; name: string | null; is_active: unknown }[])
          .filter(
            (s) =>
              s.is_active === true ||
              s.is_active === "true" ||
              s.is_active == null
          )
          .map((s) => ({ id: s.id, name: s.name }))
      );
      setDealers(
        ((dealerRes.data || []) as { id: string; name: string | null; is_active: unknown }[])
          .filter(
            (d) =>
              d.is_active === true ||
              d.is_active === "true" ||
              d.is_active == null
          )
          .map((d) => ({ id: d.id, name: d.name }))
      );
      setInitialLoading(false);
    }
    load();
  }, []);

  const filteredSeries = useMemo(
    () =>
      seriesList.filter((s) => s.manufacturer_id === product.manufacturer_id),
    [seriesList, product.manufacturer_id]
  );

  const purchaseSupplierIds = useMemo(
    () =>
      purchaseRows
        .map((r) => r.supplier_id)
        .filter((id): id is string => Boolean(id)),
    [purchaseRows]
  );

  const defaultSupplierOptions = useMemo(
    () => suppliers.filter((s) => purchaseSupplierIds.includes(s.id)),
    [suppliers, purchaseSupplierIds]
  );

  const effectiveDefaultSupplierId = purchaseSupplierIds.includes(
    product.default_supplier_id
  )
    ? product.default_supplier_id
    : "";

  function updatePurchaseRow(idx: number, patch: Partial<PurchaseRow>) {
    setPurchaseRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (!product.manufacturer_id || !product.name.trim() || !product.model_no.trim()) {
      setSubmitError("メーカー・商品名・型番は必須です。");
      return;
    }
    if (!effectiveDefaultSupplierId) {
      setSubmitError("標準仕入先を選択してください（仕入価格の仕入先から選びます）。");
      return;
    }
    if (purchaseRows.length < 1) {
      setSubmitError("仕入価格は1件以上必要です。");
      return;
    }

    const body = {
      product: {
        manufacturer_id: product.manufacturer_id,
        series_id: product.series_id || null,
        category: product.category.trim() || null,
        model_no: product.model_no.trim(),
        name: product.name.trim(),
        capacity: product.capacity.trim() || null,
        unit: product.unit.trim() || null,
        memo: product.memo.trim() || null,
        is_active: product.is_active,
        default_supplier_id: effectiveDefaultSupplierId,
      },
      purchase_prices: purchaseRows.map((r) => ({
        supplier_id: r.supplier_id,
        purchase_price: Number(r.purchase_price),
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        memo: r.memo.trim() || null,
        is_active: r.is_active,
      })),
      sales_prices: salesRows.map((r) => ({
        dealer_id: r.dealer_id,
        sales_price: Number(r.sales_price),
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        memo: r.memo.trim() || null,
        is_active: r.is_active,
      })),
    };

    setSubmitting(true);
    const result = await submitProductSetup({
      body,
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

    router.push(`/products/${result.product_id}`);
    router.refresh();
  }

  if (initialLoading) {
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
            <h1 className="text-2xl font-bold text-gray-900">商品セットアップ</h1>
            <p className="text-sm text-gray-500">
              商品・仕入価格・販売価格を1回で登録します（途中失敗時はすべて取り消されます）
            </p>
          </div>
          <Link
            href="/products"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            一覧へ戻る
          </Link>
        </div>
      </header>

      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-6xl space-y-8 rounded-xl bg-white p-8 shadow-sm"
        >
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">商品基本情報</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="メーカー *">
                <select
                  value={product.manufacturer_id}
                  onChange={(e) =>
                    setProduct((p) => ({
                      ...p,
                      manufacturer_id: e.target.value,
                      series_id: "",
                    }))
                  }
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
              </Field>
              <Field label="シリーズ">
                <select
                  value={product.series_id}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, series_id: e.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="">なし</option>
                  {filteredSeries.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="型番 *">
                <input
                  value={product.model_no}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, model_no: e.target.value }))
                  }
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="商品名 *">
                <input
                  value={product.name}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, name: e.target.value }))
                  }
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="カテゴリ">
                <input
                  value={product.category}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, category: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="容量">
                <input
                  value={product.capacity}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, capacity: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="単位">
                <input
                  value={product.unit}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, unit: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="標準仕入先 *">
                <select
                  value={effectiveDefaultSupplierId}
                  onChange={(e) =>
                    setProduct((p) => ({
                      ...p,
                      default_supplier_id: e.target.value,
                    }))
                  }
                  className={inputClass}
                  required
                >
                  <option value="">
                    {defaultSupplierOptions.length
                      ? "仕入価格の仕入先から選択"
                      : "先に仕入価格行で仕入先を選ぶ"}
                  </option>
                  {defaultSupplierOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="メモ">
                <textarea
                  value={product.memo}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, memo: e.target.value }))
                  }
                  className={inputClass}
                  rows={2}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={product.is_active}
                  onChange={(e) =>
                    setProduct((p) => ({ ...p, is_active: e.target.checked }))
                  }
                />
                有効
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">仕入価格 *</h2>
              <button
                type="button"
                onClick={() =>
                  setPurchaseRows((rows) => [...rows, emptyPurchaseRow()])
                }
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
              >
                行を追加
              </button>
            </div>
            <p className="text-xs text-gray-500">
              仕入先ごとに1行。同じ仕入先の重複は不可。標準仕入先はこの表の仕入先から選びます。
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-2 py-2">仕入先 *</th>
                    <th className="px-2 py-2">仕入価格 *</th>
                    <th className="px-2 py-2">開始日</th>
                    <th className="px-2 py-2">終了日</th>
                    <th className="px-2 py-2">メモ</th>
                    <th className="px-2 py-2">有効</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {purchaseRows.map((row, idx) => (
                    <tr key={row.key} className="border-t">
                      <td className="px-2 py-2">
                        <select
                          value={row.supplier_id}
                          onChange={(e) =>
                            updatePurchaseRow(idx, {
                              supplier_id: e.target.value,
                            })
                          }
                          className={inputClass}
                          required
                        >
                          <option value="">選択</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          value={row.purchase_price}
                          onChange={(e) =>
                            updatePurchaseRow(idx, {
                              purchase_price: e.target.value,
                            })
                          }
                          className={inputClass}
                          required
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={row.start_date}
                          onChange={(e) =>
                            updatePurchaseRow(idx, {
                              start_date: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={row.end_date}
                          onChange={(e) =>
                            updatePurchaseRow(idx, {
                              end_date: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.memo}
                          onChange={(e) =>
                            updatePurchaseRow(idx, { memo: e.target.value })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.is_active}
                          onChange={(e) =>
                            updatePurchaseRow(idx, {
                              is_active: e.target.checked,
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          disabled={purchaseRows.length <= 1}
                          onClick={() =>
                            setPurchaseRows((rows) =>
                              rows.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-xs text-red-600 disabled:text-gray-300"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">販売価格</h2>
              <button
                type="button"
                onClick={() =>
                  setSalesRows((rows) => [...rows, emptySalesRow()])
                }
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
              >
                行を追加
              </button>
            </div>
            <p className="text-xs text-gray-500">
              任意。販売店ごとに1行。同じ販売店の重複は不可。0件でも登録できます。
            </p>
            {salesRows.length === 0 ? (
              <p className="text-sm text-gray-400">販売価格行はまだありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-2 py-2">販売店 *</th>
                      <th className="px-2 py-2">販売価格 *</th>
                      <th className="px-2 py-2">開始日</th>
                      <th className="px-2 py-2">終了日</th>
                      <th className="px-2 py-2">メモ</th>
                      <th className="px-2 py-2">有効</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {salesRows.map((row, idx) => (
                      <tr key={row.key} className="border-t">
                        <td className="px-2 py-2">
                          <select
                            value={row.dealer_id}
                            onChange={(e) =>
                              setSalesRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, dealer_id: e.target.value }
                                    : r
                                )
                              )
                            }
                            className={inputClass}
                            required
                          >
                            <option value="">選択</option>
                            {dealers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={1}
                            value={row.sales_price}
                            onChange={(e) =>
                              setSalesRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, sales_price: e.target.value }
                                    : r
                                )
                              )
                            }
                            className={inputClass}
                            required
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={row.start_date}
                            onChange={(e) =>
                              setSalesRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, start_date: e.target.value }
                                    : r
                                )
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={row.end_date}
                            onChange={(e) =>
                              setSalesRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, end_date: e.target.value }
                                    : r
                                )
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={row.memo}
                            onChange={(e) =>
                              setSalesRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx ? { ...r, memo: e.target.value } : r
                                )
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.is_active}
                            onChange={(e) =>
                              setSalesRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, is_active: e.target.checked }
                                    : r
                                )
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSalesRows((rows) =>
                                rows.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-xs text-red-600"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {submitError ? (
            <p className="text-sm text-red-600">{submitError}</p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Link
              href="/products"
              className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? "登録中..." : "セットアップを登録"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
