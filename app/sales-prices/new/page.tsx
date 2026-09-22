"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SearchableSelect from "@/app/components/masters/SearchableSelect";
import {
  buildPackageSearchOption,
} from "@/app/components/masters/searchableSelect";
import PriceTargetPrefillBanner from "@/app/components/prices/PriceTargetPrefillBanner";
import {
  buildPackagePriceSummary,
  buildProductPriceSummary,
  parsePriceNewPrefill,
} from "@/lib/prices/parsePriceNewPrefill";
import {
  PRICE_TARGET_OPTIONS,
  type PriceTargetType,
} from "@/lib/prices/targetType";
import { buildPackageCompositionProductOption } from "@/lib/products/productActiveContract";
import { isProductActiveFlag } from "@/app/products/productListQuery";
import { supabase } from "@/lib/supabase";

type Dealer = {
  id: string;
  name: string | null;
};

type ManufacturerRelation =
  | { name: string | null }
  | { name: string | null }[]
  | null;

type Product = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
  unit?: string | null;
  is_active?: unknown;
  manufacturers: ManufacturerRelation;
};

type PackageRow = {
  id: string;
  name: string | null;
  package_code: string | null;
  capacity: number | string | null;
  capacity_unit: string | null;
  system_type: string | null;
  is_active?: unknown;
  manufacturers: ManufacturerRelation;
};

function manufacturerName(relation: ManufacturerRelation): string {
  if (!relation) return "";
  if (Array.isArray(relation)) return relation[0]?.name || "";
  return relation.name || "";
}

export default function NewSalesPricePage() {
  return (
    <Suspense
      fallback={
        <>
          <header className="border-b bg-white px-8 py-5">
            <h1 className="text-2xl font-bold text-gray-900">販売価格登録</h1>
            <p className="text-sm text-gray-500">読み込み中...</p>
          </header>
          <main className="p-8">
            <div className="rounded-xl bg-white p-8 text-center shadow-sm">
              <p className="text-sm text-gray-500">読み込み中...</p>
            </div>
          </main>
        </>
      }
    >
      <NewSalesPricePageInner />
    </Suspense>
  );
}

function NewSalesPricePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = parsePriceNewPrefill({
    product_id: searchParams.get("product_id"),
    package_id: searchParams.get("package_id"),
  });

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [prefillMissing, setPrefillMissing] = useState(false);

  const [form, setForm] = useState({
    dealer_id: "",
    price_target_type: (prefill.fromQuery
      ? prefill.price_target_type
      : "PRODUCT") as PriceTargetType,
    product_id: prefill.product_id,
    package_id: prefill.package_id,
    sales_price: "",
    start_date: "",
    end_date: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    async function fetchData() {
      setLoadError("");
      setPrefillMissing(false);

      const productSelect = `
            id,
            name,
            model_no,
            category,
            unit,
            is_active,
            manufacturers (
              name
            )
          `;
      const packageSelect = `
            id,
            name,
            package_code,
            capacity,
            capacity_unit,
            system_type,
            is_active,
            manufacturers (
              name
            )
          `;

      const [
        { data: dealerData, error: dealerError },
        { data: productData, error: productError },
        { data: packageData, error: packageError },
      ] = await Promise.all([
        supabase
          .from("dealers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select(productSelect)
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("packages")
          .select(packageSelect)
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      if (dealerError || productError || packageError) {
        setLoadError(
          dealerError?.message ||
            productError?.message ||
            packageError?.message ||
            "データ取得に失敗しました"
        );
        return;
      }

      let nextProducts = (productData || []) as unknown as Product[];
      let nextPackages = (packageData || []) as unknown as PackageRow[];

      if (prefill.fromQuery && prefill.price_target_type === "PRODUCT") {
        if (!nextProducts.some((p) => p.id === prefill.product_id)) {
          const { data: one } = await supabase
            .from("products")
            .select(productSelect)
            .eq("id", prefill.product_id)
            .maybeSingle();
          if (one) {
            nextProducts = [one as unknown as Product, ...nextProducts];
          } else {
            setPrefillMissing(true);
          }
        }
      }

      if (prefill.fromQuery && prefill.price_target_type === "PACKAGE") {
        if (!nextPackages.some((p) => p.id === prefill.package_id)) {
          const { data: one } = await supabase
            .from("packages")
            .select(packageSelect)
            .eq("id", prefill.package_id)
            .maybeSingle();
          if (one) {
            nextPackages = [one as unknown as PackageRow, ...nextPackages];
          } else {
            setPrefillMissing(true);
          }
        }
      }

      setDealers(dealerData || []);
      setProducts(nextProducts);
      setPackages(nextPackages);
      setForm((current) => ({
        ...current,
        price_target_type: prefill.fromQuery
          ? prefill.price_target_type
          : current.price_target_type,
        product_id: prefill.fromQuery ? prefill.product_id : current.product_id,
        package_id: prefill.fromQuery ? prefill.package_id : current.package_id,
      }));
    }

    fetchData();
  }, [prefill.fromQuery, prefill.package_id, prefill.price_target_type, prefill.product_id]);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = e.target;

    if (name === "price_target_type") {
      setForm((current) => ({
        ...current,
        price_target_type: value as PriceTargetType,
        product_id: "",
        package_id: "",
      }));
      return;
    }

    const target = e.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      setForm((current) => ({
        ...current,
        [name]: target.checked,
      }));
      return;
    }

    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.dealer_id) {
      alert("販売店を選択してください");
      return;
    }

    const isProduct = form.price_target_type === "PRODUCT";
    if (isProduct && !form.product_id) {
      alert("商品を選択してください");
      return;
    }
    if (!isProduct && !form.package_id) {
      alert("パッケージ商品を選択してください");
      return;
    }

    if (!form.sales_price) {
      alert("販売価格を入力してください");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("sales_prices").insert({
      dealer_id: form.dealer_id,
      price_target_type: form.price_target_type,
      product_id: isProduct ? form.product_id : null,
      package_id: isProduct ? null : form.package_id,
      sales_price: Number(form.sales_price),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      memo: form.memo,
      is_active: form.is_active,
    });

    setLoading(false);

    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }

    router.push("/sales-prices");
    router.refresh();
  }

  const isProduct = form.price_target_type === "PRODUCT";
  const selectedProduct = products.find((p) => p.id === form.product_id);
  const selectedPackage = packages.find((p) => p.id === form.package_id);

  const productSelectOptions = useMemo(
    () =>
      products.map((product) =>
        buildPackageCompositionProductOption({
          id: product.id,
          name: product.name || "",
          model_no: product.model_no,
          category: product.category,
          manufacturer_name: manufacturerName(product.manufacturers) || null,
          is_active:
            product.is_active === undefined ? true : product.is_active,
        })
      ),
    [products]
  );

  const packageSelectOptions = useMemo(
    () =>
      packages.map((pkg) => {
        const base = buildPackageSearchOption({
          id: pkg.id,
          name: pkg.name || "",
          package_code: pkg.package_code,
        });
        if (
          pkg.is_active === undefined ||
          isProductActiveFlag(pkg.is_active)
        ) {
          return base;
        }
        return {
          ...base,
          label: `${base.label}（利用停止）`,
          primaryText: `${base.primaryText}（利用停止）`,
          searchText: `${base.searchText} 利用停止`,
        };
      }),
    [packages]
  );

  const prefillSummary =
    prefill.fromQuery && !prefillMissing
      ? isProduct && selectedProduct
        ? buildProductPriceSummary({
            name: selectedProduct.name,
            model_no: selectedProduct.model_no,
            manufacturerName: manufacturerName(selectedProduct.manufacturers),
          })
        : !isProduct && selectedPackage
          ? buildPackagePriceSummary({
              name: selectedPackage.name,
              package_code: selectedPackage.package_code,
              manufacturerName: manufacturerName(selectedPackage.manufacturers),
            })
          : null
      : null;

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">販売価格登録</h1>
        <p className="text-sm text-gray-500">
          販売店ごとの商品・パッケージ販売価格を登録します
        </p>
      </header>

      <main className="p-8">
        {loadError ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-5xl rounded-xl bg-white p-8 shadow-sm"
        >
          <PriceTargetPrefillBanner
            summary={prefillSummary}
            missing={prefill.fromQuery && prefillMissing}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="販売店">
              <select
                name="dealer_id"
                value={form.dealer_id}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option value="">販売店を選択</option>
                {dealers.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="価格対象">
              <select
                name="price_target_type"
                value={form.price_target_type}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                {PRICE_TARGET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>

            {isProduct ? (
              <Field
                label="商品"
                description="型番・商品名・メーカー・カテゴリで検索できます"
              >
                <SearchableSelect
                  options={productSelectOptions}
                  value={form.product_id}
                  onChange={(selectedId) =>
                    setForm((current) => ({
                      ...current,
                      product_id: selectedId,
                    }))
                  }
                  placeholder="型番・商品名・メーカーで検索"
                  unsetLabel="商品を検索して選択"
                  disabled={loading}
                />
                {selectedProduct?.unit ? (
                  <p className="mt-1 text-xs text-gray-500">
                    単位: {selectedProduct.unit}
                  </p>
                ) : null}
              </Field>
            ) : (
              <Field
                label="パッケージ商品"
                description="パッケージコード・名称で検索できます"
              >
                <SearchableSelect
                  options={packageSelectOptions}
                  value={form.package_id}
                  onChange={(selectedId) =>
                    setForm((current) => ({
                      ...current,
                      package_id: selectedId,
                    }))
                  }
                  placeholder="コード・名称で検索"
                  unsetLabel="パッケージを検索して選択"
                  disabled={loading}
                />
              </Field>
            )}

            <Field label="販売価格（税抜）">
              <input
                type="number"
                name="sales_price"
                value={form.sales_price}
                onChange={handleChange}
                required
                placeholder="例：1380000"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="適用開始日">
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="適用終了日">
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-6">
            <Field label="備考">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-8 flex gap-4">
            <button
              type="button"
              onClick={() => router.push("/sales-prices")}
              className="rounded-lg border px-6 py-3 text-sm font-bold text-gray-700"
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

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <p className="mb-2 text-sm font-bold text-gray-700">{label}</p>
      {description ? (
        <p className="mb-2 text-xs text-gray-500">{description}</p>
      ) : null}
      {children}
    </div>
  );
}
