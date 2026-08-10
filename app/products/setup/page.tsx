"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

import {
  createIdempotencyKey,
  submitProductBulkSetup,
} from "./submitProductBulkSetup";
import {
  PRODUCT_BULK_MAX_PRODUCTS,
  remapProductBulkFieldErrors,
} from "@/lib/productBulkSetup/createProductBulkSetupLogic";

type Manufacturer = { id: string; name: string | null };
type Series = { id: string; name: string | null; manufacturer_id: string };

type ProductDraft = {
  key: string;
  model_no: string;
  name: string;
  capacity: string;
  unit: string;
  memo: string;
  is_active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900";

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyProduct(): ProductDraft {
  return {
    key: newKey(),
    model_no: "",
    name: "",
    capacity: "",
    unit: "",
    memo: "",
    is_active: true,
  };
}

/**
 * 商品セットアップ（商品マスタのみ一括登録）。
 * 仕入価格・販売価格は同梱しない。価格は商品詳細 /prices /sales-prices から設定。
 */
export default function ProductSetupPage() {
  const router = useRouter();
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [manufacturerId, setManufacturerId] = useState("");
  const [category, setCategory] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [rows, setRows] = useState<ProductDraft[]>([
    emptyProduct(),
    emptyProduct(),
    emptyProduct(),
  ]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      const [mRes, sRes] = await Promise.all([
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
      ]);
      if (mRes.error || sRes.error) {
        setLoadError(
          mRes.error?.message ||
            sRes.error?.message ||
            "マスタ取得に失敗しました"
        );
        setLoading(false);
        return;
      }
      setManufacturers((mRes.data || []) as Manufacturer[]);
      setSeriesList((sRes.data || []) as Series[]);
      setLoading(false);
    }
    void load();
  }, []);

  const filteredSeries = useMemo(
    () =>
      seriesList.filter(
        (s) => !manufacturerId || s.manufacturer_id === manufacturerId
      ),
    [seriesList, manufacturerId]
  );

  function updateRow(key: string, patch: Partial<ProductDraft>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setRows((prev) => {
      if (prev.length >= PRODUCT_BULK_MAX_PRODUCTS) return prev;
      return [...prev, emptyProduct()];
    });
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    setFieldErrors({});

    // 空行は送らない。エラー index は画面行へ remap する。
    const filledWithUiIndex = rows
      .map((r, uiIndex) => ({ r, uiIndex }))
      .filter(
        ({ r }) =>
          r.model_no.trim() ||
          r.name.trim() ||
          r.capacity.trim() ||
          r.unit.trim() ||
          r.memo.trim()
      );
    const selected =
      filledWithUiIndex.length > 0
        ? filledWithUiIndex
        : [{ r: rows[0], uiIndex: 0 }];
    const payloadIndexToUiIndex = selected.map((x) => x.uiIndex);
    const products = selected.map(({ r }) => ({
      model_no: r.model_no.trim(),
      name: r.name.trim(),
      capacity: r.capacity.trim() || null,
      unit: r.unit.trim() || null,
      memo: r.memo.trim() || null,
      is_active: r.is_active,
    }));

    const result = await submitProductBulkSetup({
      idempotencyKey: idempotencyKeyRef.current,
      body: {
        manufacturer_id: manufacturerId,
        category: category.trim() || null,
        series_id: seriesId || null,
        products,
      },
    });

    if (!result.ok) {
      setSubmitError(result.error_message);
      setFieldErrors(
        remapProductBulkFieldErrors(result.field_errors, payloadIndexToUiIndex)
      );
      if (
        result.error_code !== "REQUEST_IN_PROGRESS" &&
        result.error_code !== "REQUEST_ID_CONFLICT"
      ) {
        idempotencyKeyRef.current = createIdempotencyKey();
      }
      setSubmitting(false);
      return;
    }

    const qs = new URLSearchParams();
    qs.set("manufacturer_id", result.manufacturer_id);
    if (category.trim()) qs.set("category", category.trim());
    router.push(`/products?${qs.toString()}`);
    router.refresh();
  }

  const filledCount = rows.filter(
    (r) => r.model_no.trim() && r.name.trim()
  ).length;

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">商品セットアップ</h1>
            <p className="mt-1 text-sm text-gray-500">
              メーカー・カテゴリー単位で商品マスタを一括登録します。仕入価格・販売価格はこの画面では登録しません。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              ← 商品一覧
            </Link>
            <Link
              href="/prices"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              仕入価格
            </Link>
            <Link
              href="/sales-prices"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              販売価格
            </Link>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-8">
        {loading ? (
          <p className="text-sm text-gray-600">読み込み中...</p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-6"
            data-testid="product-bulk-setup"
          >
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-gray-900">共通項目</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">メーカー *</span>
                  <select
                    className={`${inputClass} mt-1`}
                    value={manufacturerId}
                    onChange={(e) => {
                      setManufacturerId(e.target.value);
                      setSeriesId("");
                    }}
                    required
                  >
                    <option value="">選択してください</option>
                    {manufacturers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.manufacturer_id ? (
                    <span className="mt-1 block text-xs text-red-600">
                      {fieldErrors.manufacturer_id}
                    </span>
                  ) : null}
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">カテゴリー</span>
                  <input
                    className={`${inputClass} mt-1`}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="例: 蓄電池 / 太陽光"
                    list="product-setup-category-suggestions"
                  />
                  <datalist id="product-setup-category-suggestions">
                    <option value="蓄電池" />
                    <option value="太陽光" />
                    <option value="パワコン" />
                    <option value="架台" />
                    <option value="部材" />
                  </datalist>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">シリーズ（任意）</span>
                  <select
                    className={`${inputClass} mt-1`}
                    value={seriesId}
                    onChange={(e) => setSeriesId(e.target.value)}
                    disabled={!manufacturerId}
                  >
                    <option value="">未設定</option>
                    {filteredSeries.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                下の全商品行に、上記メーカー・カテゴリー・シリーズが適用されます。
              </p>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">商品行</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {rows.length} / {PRODUCT_BULK_MAX_PRODUCTS} 行（空行は登録時に除外）
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="product-bulk-add-row"
                  disabled={rows.length >= PRODUCT_BULK_MAX_PRODUCTS}
                  onClick={addRow}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  ＋ 商品を追加
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">型番 *</th>
                      <th className="px-2 py-2">商品名 *</th>
                      <th className="px-2 py-2">容量</th>
                      <th className="px-2 py-2">単位</th>
                      <th className="px-2 py-2">メモ</th>
                      <th className="px-2 py-2">有効</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row.key} className="border-b align-top last:border-0">
                        <td className="px-2 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass}
                            value={row.model_no}
                            onChange={(e) =>
                              updateRow(row.key, { model_no: e.target.value })
                            }
                            placeholder="型番"
                          />
                          {fieldErrors[`products.${idx}.model_no`] ? (
                            <p className="mt-1 text-xs text-red-600">
                              {fieldErrors[`products.${idx}.model_no`]}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass}
                            value={row.name}
                            onChange={(e) =>
                              updateRow(row.key, { name: e.target.value })
                            }
                            placeholder="商品名"
                          />
                          {fieldErrors[`products.${idx}.name`] ? (
                            <p className="mt-1 text-xs text-red-600">
                              {fieldErrors[`products.${idx}.name`]}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass}
                            value={row.capacity}
                            onChange={(e) =>
                              updateRow(row.key, { capacity: e.target.value })
                            }
                            placeholder="440W"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass}
                            value={row.unit}
                            onChange={(e) =>
                              updateRow(row.key, { unit: e.target.value })
                            }
                            placeholder="枚 / 台"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass}
                            value={row.memo}
                            onChange={(e) =>
                              updateRow(row.key, { memo: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={row.is_active}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  is_active: e.target.checked,
                                })
                              }
                            />
                            有効
                          </label>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            disabled={rows.length <= 1}
                            className="text-xs text-gray-500 underline disabled:opacity-40"
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

            {submitError ? (
              <p className="text-sm text-red-600" role="alert">
                {submitError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting || !manufacturerId}
                className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {submitting
                  ? "登録中..."
                  : `${filledCount || rows.length}件の商品を登録`}
              </button>
              <p className="text-xs text-gray-500">
                登録後、各商品の詳細から仕入価格・販売価格を設定できます。
              </p>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
