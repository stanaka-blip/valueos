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
import { getTodayDateString } from "@/lib/purchasePrices";
import {
  fetchActiveSalesUnitPrices,
} from "@/lib/salesPrices";
import { supabase } from "@/lib/supabase";

import {
  createIdempotencyKey,
  submitDealerSalesPriceBulk,
} from "./submitDealerSalesPriceBulk";

type Dealer = { id: string; name: string | null };
type Manufacturer = { id: string; name: string | null };
type ProductRow = {
  id: string;
  manufacturer_id: string | null;
  series_id: string | null;
  model_no: string | null;
  name: string | null;
  category: string | null;
  capacity: string | null;
  unit: string | null;
  is_active: unknown;
  manufacturer_name: string;
  series_name: string;
};

type DraftRow = {
  selected: boolean;
  sales_price: string;
  start_date: string;
  end_date: string;
  memo: string;
  is_active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900";

function formatCapacity(capacity: string | null, unit: string | null): string {
  const c = capacity?.trim();
  if (!c) return "—";
  const u = unit?.trim();
  return u ? `${c}${u}` : c;
}

export default function BulkByDealerPage() {
  const router = useRouter();
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [priceError, setPriceError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [dealerId, setDealerId] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [currentByProductId, setCurrentByProductId] = useState<
    Map<string, number>
  >(new Map());
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      const [dRes, mRes, sRes, pRes] = await Promise.all([
        supabase
          .from("dealers")
          .select("id, name, is_active")
          .order("name", { ascending: true }),
        supabase
          .from("manufacturers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase.from("product_series").select("id, name"),
        supabase
          .from("products")
          .select(
            `
            id,
            manufacturer_id,
            series_id,
            model_no,
            name,
            category,
            capacity,
            unit,
            is_active,
            manufacturers ( name )
          `
          )
          .order("model_no", { ascending: true }),
      ]);

      if (dRes.error || mRes.error || pRes.error) {
        setLoadError(
          dRes.error?.message ||
            mRes.error?.message ||
            pRes.error?.message ||
            "マスタ取得に失敗しました"
        );
        setLoading(false);
        return;
      }

      const seriesNameById = new Map(
        ((sRes.data || []) as { id: string; name: string | null }[]).map(
          (s) => [s.id, s.name?.trim() || ""] as const
        )
      );

      setDealers(
        ((dRes.data || []) as {
          id: string;
          name: string | null;
          is_active: unknown;
        }[])
          .filter(
            (d) =>
              d.is_active === true ||
              d.is_active === "true" ||
              d.is_active == null
          )
          .map((d) => ({ id: d.id, name: d.name }))
      );
      setManufacturers((mRes.data || []) as Manufacturer[]);
      setProducts(
        ((pRes.data || []) as Array<Record<string, unknown>>).map((row) => {
          const makers = row.manufacturers as
            | { name: string | null }
            | { name: string | null }[]
            | null;
          const maker = Array.isArray(makers) ? makers[0] : makers;
          const seriesId = (row.series_id as string | null) || null;
          return {
            id: String(row.id),
            manufacturer_id: (row.manufacturer_id as string | null) || null,
            series_id: seriesId,
            model_no: (row.model_no as string | null) || null,
            name: (row.name as string | null) || null,
            category: (row.category as string | null) || null,
            capacity: (row.capacity as string | null) || null,
            unit: (row.unit as string | null) || null,
            is_active: row.is_active,
            manufacturer_name: maker?.name?.trim() || "",
            series_name: seriesId ? seriesNameById.get(seriesId) || "" : "",
          };
        })
      );
      setLoading(false);
    }
    load();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (
        manufacturerId &&
        p.manufacturer_id === manufacturerId &&
        p.category?.trim()
      ) {
        set.add(p.category.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [products, manufacturerId]);

  const visibleProducts = useMemo(() => {
    if (!manufacturerId) return [];
    const listRows: ProductListRow[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      model_no: p.model_no,
      is_active: p.is_active,
      manufacturer_id: p.manufacturer_id,
      manufacturerName: p.manufacturer_name,
    }));
    return listRows
      .filter((row) => row.manufacturer_id === manufacturerId)
      .filter((row) => isProductActiveFlag(row.is_active))
      .filter((row) => !category || (row.category || "") === category)
      .filter((row) => matchesProductSearch(row, q))
      .map((row) => products.find((p) => p.id === row.id)!)
      .filter(Boolean);
  }, [products, manufacturerId, category, q]);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrent() {
      setPriceError("");
      if (!dealerId || visibleProducts.length === 0) {
        setCurrentByProductId(new Map());
        return;
      }
      const result = await fetchActiveSalesUnitPrices(supabase, {
        productIds: visibleProducts.map((p) => p.id),
        dealerId,
        asOfDate: getTodayDateString(),
      });
      if (cancelled) return;
      if (result.error) {
        setPriceError(result.error);
        setCurrentByProductId(new Map());
        return;
      }
      setCurrentByProductId(result.unitPriceByProductId);
    }
    loadCurrent();
    return () => {
      cancelled = true;
    };
  }, [dealerId, visibleProducts]);

  function ensureDraft(productId: string): DraftRow {
    return (
      drafts[productId] || {
        selected: false,
        sales_price: "",
        start_date: getTodayDateString(),
        end_date: "",
        memo: "",
        is_active: true,
      }
    );
  }

  function patchDraft(productId: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({
      ...prev,
      [productId]: { ...ensureDraft(productId), ...patch },
    }));
  }

  const selectedCount = useMemo(
    () => visibleProducts.filter((p) => drafts[p.id]?.selected).length,
    [visibleProducts, drafts]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitError("");

    if (!dealerId) {
      setSubmitError("販売店を選択してください。");
      return;
    }

    const items = visibleProducts
      .filter((p) => drafts[p.id]?.selected)
      .map((p) => {
        const d = drafts[p.id];
        return {
          product_id: p.id,
          sales_price: Number(d.sales_price),
          start_date: d.start_date || null,
          end_date: d.end_date || null,
          memo: d.memo.trim() || null,
          is_active: d.is_active,
        };
      });

    if (items.length === 0) {
      setSubmitError("登録する商品にチェックを入れてください。");
      return;
    }

    setSubmitting(true);
    const result = await submitDealerSalesPriceBulk({
      body: { dealer_id: dealerId, items },
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

    router.push("/sales-prices");
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
              販売店ごとに一括登録
            </h1>
            <p className="text-sm text-gray-500">
              1つの販売店に対し、メーカー配下の複数商品へ販売価格をまとめて追加します（途中失敗時はすべて取り消されます）
            </p>
          </div>
          <Link
            href="/sales-prices"
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">販売店 *</span>
              <select
                value={dealerId}
                onChange={(e) => setDealerId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">選択してください</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">メーカー *</span>
              <select
                value={manufacturerId}
                onChange={(e) => {
                  setManufacturerId(e.target.value);
                  setCategory("");
                  setDrafts({});
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
              <span className="text-sm font-medium text-gray-700">
                カテゴリ（任意）
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
                disabled={!manufacturerId}
              >
                <option value="">すべて</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">
                商品検索（型番・商品名）
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={inputClass}
                placeholder="型番や商品名で絞り込み"
                disabled={!manufacturerId}
              />
            </label>
          </div>

          {priceError ? (
            <p className="text-sm text-red-600">
              現行販売価格の取得エラー：{priceError}
            </p>
          ) : null}

          {!manufacturerId ? (
            <p className="text-sm text-gray-500">
              メーカーを選択すると商品一覧が表示されます。
            </p>
          ) : visibleProducts.length === 0 ? (
            <p className="text-sm text-gray-500">該当する商品がありません。</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">選択</th>
                    <th className="px-3 py-2">シリーズ</th>
                    <th className="px-3 py-2">型番</th>
                    <th className="px-3 py-2">商品名</th>
                    <th className="px-3 py-2">カテゴリ</th>
                    <th className="px-3 py-2">容量</th>
                    <th className="px-3 py-2">現行販売価格</th>
                    <th className="px-3 py-2">新販売価格 *</th>
                    <th className="px-3 py-2">開始日</th>
                    <th className="px-3 py-2">終了日</th>
                    <th className="px-3 py-2">メモ</th>
                    <th className="px-3 py-2">有効</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => {
                    const draft = ensureDraft(p.id);
                    const current = currentByProductId.get(p.id);
                    return (
                      <tr key={p.id} className="border-t align-top">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            onChange={(e) =>
                              patchDraft(p.id, { selected: e.target.checked })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">{p.series_name || "—"}</td>
                        <td className="px-3 py-2 font-semibold">
                          {p.model_no || "—"}
                        </td>
                        <td className="px-3 py-2">{p.name || "—"}</td>
                        <td className="px-3 py-2">{p.category || "—"}</td>
                        <td className="px-3 py-2">
                          {formatCapacity(p.capacity, p.unit)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {current != null
                            ? `¥${current.toLocaleString("ja-JP")}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            value={draft.sales_price}
                            onChange={(e) =>
                              patchDraft(p.id, {
                                sales_price: e.target.value,
                                selected: true,
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={draft.start_date}
                            onChange={(e) =>
                              patchDraft(p.id, { start_date: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={draft.end_date}
                            onChange={(e) =>
                              patchDraft(p.id, { end_date: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={draft.memo}
                            onChange={(e) =>
                              patchDraft(p.id, { memo: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={draft.is_active}
                            onChange={(e) =>
                              patchDraft(p.id, { is_active: e.target.checked })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {submitError ? (
            <p className="text-sm text-red-600">{submitError}</p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              選択中 {selectedCount} 件 / 表示 {visibleProducts.length} 件
            </p>
            <div className="flex gap-3">
              <Link
                href="/sales-prices"
                className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700"
              >
                キャンセル
              </Link>
              <button
                type="submit"
                disabled={submitting || selectedCount === 0}
                className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {submitting
                  ? "登録中..."
                  : "選択した商品の販売価格を登録"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </>
  );
}
