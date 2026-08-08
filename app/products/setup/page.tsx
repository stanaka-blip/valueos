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

import {
  isProductActiveFlag,
  matchesProductSearch,
  type ProductListRow,
} from "@/app/products/productListQuery";
import { supabase } from "@/lib/supabase";

import {
  createIdempotencyKey,
  submitProductSetup,
} from "./submitProductSetup";
import { submitExistingProductPriceSetup } from "./submitExistingProductPriceSetup";

type SetupMode = "existing" | "new";

type Manufacturer = { id: string; name: string | null };
type Series = { id: string; name: string | null; manufacturer_id: string | null };
type Supplier = { id: string; name: string | null };
type Dealer = { id: string; name: string | null };

type ProductOption = {
  id: string;
  manufacturer_id: string | null;
  series_id: string | null;
  category: string | null;
  model_no: string | null;
  name: string | null;
  capacity: string | null;
  unit: string | null;
  is_active: unknown;
  series_name: string | null;
  manufacturer_name: string | null;
};

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

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900";

export default function ProductSetupPage() {
  const router = useRouter();
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  const [mode, setMode] = useState<SetupMode>("existing");
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [existingManufacturerId, setExistingManufacturerId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");

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
      const [mRes, sRes, supplierRes, dealerRes, productRes] = await Promise.all([
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
        supabase
          .from("products")
          .select(
            `
            id,
            manufacturer_id,
            series_id,
            category,
            model_no,
            name,
            capacity,
            unit,
            is_active,
            manufacturers ( name )
          `
          )
          .order("model_no", { ascending: true }),
      ]);

      if (
        mRes.error ||
        sRes.error ||
        supplierRes.error ||
        dealerRes.error ||
        productRes.error
      ) {
        setLoadError(
          mRes.error?.message ||
            sRes.error?.message ||
            supplierRes.error?.message ||
            dealerRes.error?.message ||
            productRes.error?.message ||
            "マスタの取得に失敗しました"
        );
        setInitialLoading(false);
        return;
      }

      const seriesRows = (sRes.data || []) as Series[];
      const seriesNameById = new Map(
        seriesRows.map((s) => [s.id, s.name || null] as const)
      );

      setManufacturers((mRes.data || []) as Manufacturer[]);
      setSeriesList(seriesRows);
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

      // シリーズ名は product_series 一覧とクライアント結合（embed 失敗で全件落ちるのを避ける）
      const mapped: ProductOption[] = (
        (productRes.data || []) as Array<Record<string, unknown>>
      ).map((row) => {
        const makers = row.manufacturers as
          | { name: string | null }
          | { name: string | null }[]
          | null;
        const makerRow = Array.isArray(makers) ? makers[0] : makers;
        const seriesId = (row.series_id as string | null) || null;
        return {
          id: String(row.id),
          manufacturer_id: (row.manufacturer_id as string | null) || null,
          series_id: seriesId,
          category: (row.category as string | null) || null,
          model_no: (row.model_no as string | null) || null,
          name: (row.name as string | null) || null,
          capacity: (row.capacity as string | null) || null,
          unit: (row.unit as string | null) || null,
          is_active: row.is_active,
          series_name: seriesId ? seriesNameById.get(seriesId) || null : null,
          manufacturer_name: makerRow?.name || null,
        };
      });
      setProducts(mapped);
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

  const filteredExistingProducts = useMemo(() => {
    if (!existingManufacturerId) return [];
    const rows: ProductListRow[] = products
      .filter(
        (p) =>
          p.manufacturer_id === existingManufacturerId &&
          isProductActiveFlag(p.is_active)
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        model_no: p.model_no,
        is_active: p.is_active,
        manufacturer_id: p.manufacturer_id,
        manufacturerName: p.manufacturer_name || "",
      }));
    return rows
      .filter((row) => matchesProductSearch(row, productSearch))
      .map((row) => products.find((p) => p.id === row.id)!)
      .filter(Boolean);
  }, [products, existingManufacturerId, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  function switchMode(next: SetupMode) {
    setMode(next);
    setSubmitError("");
    idempotencyKeyRef.current = createIdempotencyKey();
  }

  function updatePurchaseRow(idx: number, patch: Partial<PurchaseRow>) {
    setPurchaseRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitError("");

    if (purchaseRows.length < 1) {
      setSubmitError("仕入価格は1件以上必要です。");
      return;
    }

    const purchase_prices = purchaseRows.map((r) => ({
      supplier_id: r.supplier_id,
      purchase_price: Number(r.purchase_price),
      start_date: r.start_date || null,
      end_date: r.end_date || null,
      memo: r.memo.trim() || null,
      is_active: r.is_active,
    }));
    const sales_prices = salesRows.map((r) => ({
      dealer_id: r.dealer_id,
      sales_price: Number(r.sales_price),
      start_date: r.start_date || null,
      end_date: r.end_date || null,
      memo: r.memo.trim() || null,
      is_active: r.is_active,
    }));

    setSubmitting(true);

    if (mode === "existing") {
      if (!selectedProductId) {
        setSubmitting(false);
        setSubmitError("商品を選択してください。");
        return;
      }
      const result = await submitExistingProductPriceSetup({
        body: {
          product_id: selectedProductId,
          purchase_prices,
          sales_prices,
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
      router.push(`/products/${result.product_id}`);
      router.refresh();
      return;
    }

    if (
      !product.manufacturer_id ||
      !product.name.trim() ||
      !product.model_no.trim()
    ) {
      setSubmitting(false);
      setSubmitError("メーカー・商品名・型番は必須です。");
      return;
    }
    if (!effectiveDefaultSupplierId) {
      setSubmitting(false);
      setSubmitError(
        "標準仕入先を選択してください（仕入価格の仕入先から選びます）。"
      );
      return;
    }

    const result = await submitProductSetup({
      body: {
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
        purchase_prices,
        sales_prices,
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
              既存商品への価格追加、または新規商品＋価格の一括登録（途中失敗時はすべて取り消されます）
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
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">登録モード</h2>
            <div className="flex flex-wrap gap-3">
              <ModeButton
                active={mode === "existing"}
                onClick={() => switchMode("existing")}
                label="既存商品を選択"
              />
              <ModeButton
                active={mode === "new"}
                onClick={() => switchMode("new")}
                label="新規商品を登録"
              />
            </div>
            <p className="text-xs text-gray-500">
              初期は「既存商品を選択」です。新規の手入力フォームは「新規商品を登録」に切り替えたときだけ表示されます。
            </p>
          </section>

          {mode === "existing" ? (
            <section className="space-y-4" data-testid="existing-product-setup">
              <h2 className="text-lg font-bold text-gray-900">既存商品</h2>
              <p className="text-sm text-gray-500">
                メーカーで絞り込み、検索可能な商品Pickerから選択します（型番・商品名の手入力はありません）。
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="メーカー *">
                  <select
                    value={existingManufacturerId}
                    onChange={(e) => {
                      setExistingManufacturerId(e.target.value);
                      setSelectedProductId("");
                      setProductSearch("");
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
                </Field>
                <Field label="商品検索（型番・商品名）">
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className={inputClass}
                    placeholder="型番や商品名で絞り込み"
                    disabled={!existingManufacturerId}
                  />
                </Field>
              </div>

              <Field label="商品 *">
                {!existingManufacturerId ? (
                  <p className="text-sm text-gray-500">先にメーカーを選択してください</p>
                ) : filteredExistingProducts.length === 0 ? (
                  <p className="text-sm text-gray-500">該当する商品がありません</p>
                ) : (
                  <div
                    className="max-h-64 overflow-y-auto rounded-lg border border-gray-200"
                    data-testid="existing-product-picker"
                  >
                    {filteredExistingProducts.map((p) => {
                      const active = p.id === selectedProductId;
                      const label = [
                        p.model_no?.trim() || "—",
                        p.name?.trim() || "—",
                        p.series_name?.trim() || "—",
                      ].join(" ｜ ");
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProductId(p.id)}
                          className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 ${
                            active
                              ? "bg-gray-900 font-semibold text-white"
                              : "bg-white text-gray-900 hover:bg-gray-50"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>

              {selectedProduct ? (
                <div className="grid gap-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-700 md:grid-cols-2">
                  <ReadOnly label="メーカー" value={selectedProduct.manufacturer_name} />
                  <ReadOnly label="シリーズ" value={selectedProduct.series_name} />
                  <ReadOnly label="型番" value={selectedProduct.model_no} />
                  <ReadOnly label="商品名" value={selectedProduct.name} />
                  <ReadOnly label="カテゴリ" value={selectedProduct.category} />
                  <ReadOnly
                    label="容量"
                    value={
                      selectedProduct.capacity
                        ? `${selectedProduct.capacity}${selectedProduct.unit || ""}`
                        : null
                    }
                  />
                  <ReadOnly label="単位" value={selectedProduct.unit} />
                </div>
              ) : null}
            </section>
          ) : (
            <section className="space-y-4" data-testid="new-product-setup">
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
          )}

          <PriceTables
            purchaseRows={purchaseRows}
            salesRows={salesRows}
            suppliers={suppliers}
            dealers={dealers}
            onAddPurchase={() =>
              setPurchaseRows((rows) => [...rows, emptyPurchaseRow()])
            }
            onAddSales={() =>
              setSalesRows((rows) => [...rows, emptySalesRow()])
            }
            onUpdatePurchase={updatePurchaseRow}
            onRemovePurchase={(idx) =>
              setPurchaseRows((rows) => rows.filter((_, i) => i !== idx))
            }
            onUpdateSales={(idx, patch) =>
              setSalesRows((rows) =>
                rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
              )
            }
            onRemoveSales={(idx) =>
              setSalesRows((rows) => rows.filter((_, i) => i !== idx))
            }
          />

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
              {submitting
                ? "登録中..."
                : mode === "existing"
                  ? "価格を登録"
                  : "セットアップを登録"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-bold ${
        active
          ? "bg-gray-900 text-white"
          : "border border-gray-300 bg-white text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

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

function ReadOnly({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{value?.trim() || "—"}</div>
    </div>
  );
}

function PriceTables({
  purchaseRows,
  salesRows,
  suppliers,
  dealers,
  onAddPurchase,
  onAddSales,
  onUpdatePurchase,
  onRemovePurchase,
  onUpdateSales,
  onRemoveSales,
}: {
  purchaseRows: PurchaseRow[];
  salesRows: SalesRow[];
  suppliers: Supplier[];
  dealers: Dealer[];
  onAddPurchase: () => void;
  onAddSales: () => void;
  onUpdatePurchase: (idx: number, patch: Partial<PurchaseRow>) => void;
  onRemovePurchase: (idx: number) => void;
  onUpdateSales: (idx: number, patch: Partial<SalesRow>) => void;
  onRemoveSales: (idx: number) => void;
}) {
  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">仕入価格 *</h2>
          <button
            type="button"
            onClick={onAddPurchase}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
          >
            行を追加
          </button>
        </div>
        <p className="text-xs text-gray-500">
          仕入先ごとに1行。同じ仕入先の重複は不可。
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
                        onUpdatePurchase(idx, { supplier_id: e.target.value })
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
                        onUpdatePurchase(idx, {
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
                        onUpdatePurchase(idx, { start_date: e.target.value })
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="date"
                      value={row.end_date}
                      onChange={(e) =>
                        onUpdatePurchase(idx, { end_date: e.target.value })
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.memo}
                      onChange={(e) =>
                        onUpdatePurchase(idx, { memo: e.target.value })
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(e) =>
                        onUpdatePurchase(idx, { is_active: e.target.checked })
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      disabled={purchaseRows.length <= 1}
                      onClick={() => onRemovePurchase(idx)}
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
            onClick={onAddSales}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
          >
            行を追加
          </button>
        </div>
        <p className="text-xs text-gray-500">
          任意。販売店ごとに1行。0件でも登録できます。
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
                          onUpdateSales(idx, { dealer_id: e.target.value })
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
                          onUpdateSales(idx, { sales_price: e.target.value })
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
                          onUpdateSales(idx, { start_date: e.target.value })
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        value={row.end_date}
                        onChange={(e) =>
                          onUpdateSales(idx, { end_date: e.target.value })
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.memo}
                        onChange={(e) =>
                          onUpdateSales(idx, { memo: e.target.value })
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        onChange={(e) =>
                          onUpdateSales(idx, { is_active: e.target.checked })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => onRemoveSales(idx)}
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
    </>
  );
}
