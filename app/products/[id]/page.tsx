import Link from "next/link";
import { notFound } from "next/navigation";

import {
  sanitizeProductsReturnTo,
  withProductsReturnTo,
} from "@/app/products/productListQuery";
import ProductActiveToggleButton from "@/app/products/ProductActiveToggleButton";
import {
  productStatusBadgeClass,
  productStatusLabel,
} from "@/app/products/productActiveStatus";

import MasterPricePanels from "@/app/components/prices/MasterPricePanels";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function relationName(
  value:
    | { name: string | null }
    | { name: string | null }[]
    | null
    | undefined
): string {
  if (!value) return "—";
  const row = Array.isArray(value) ? value[0] : value;
  return (row?.name || "").trim() || "—";
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const returnTo = sanitizeProductsReturnTo(sp.returnTo);
  const listHref = returnTo || "/products";
  const editHref = withProductsReturnTo(`/products/${id}/edit`, returnTo);

  const { data: product, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      model_no,
      category,
      capacity,
      unit,
      memo,
      is_active,
      default_supplier_id,
      manufacturers ( name ),
      series:series_id ( name ),
      suppliers:default_supplier_id ( name )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">
          商品の取得に失敗しました：{error.message}
        </p>
        <Link href={listHref} className="mt-4 inline-block text-sm text-gray-700 underline">
          ← 商品一覧へ戻る
        </Link>
      </main>
    );
  }

  if (!product) {
    notFound();
  }

  const maker = relationName(product.manufacturers);
  const seriesName = relationName(product.series);
  const supplierName = relationName(product.suppliers);
  const capacity =
    product.capacity != null && String(product.capacity).trim()
      ? `${product.capacity}${product.unit ? product.unit : ""}`
      : "—";

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">商品詳細</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {product.name || "名称未設定"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              型番: {product.model_no || "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={listHref}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              ← 商品一覧へ戻る
            </Link>
            <Link
              href={editHref}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              編集
            </Link>
            <Link
              href={`/products/new?copyFrom=${id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              複製して新規登録
            </Link>
            <ProductActiveToggleButton
              productId={id}
              productLabel={product.name || product.model_no || "商品"}
              isActive={product.is_active}
            />
            <Link
              href={`/prices/new?product_id=${id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              仕入価格を追加
            </Link>
            <Link
              href={`/sales-prices/new?product_id=${id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              販売価格を追加
            </Link>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-8">
        <section className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">基本情報</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">商品名</dt>
              <dd className="font-semibold text-gray-900">
                {product.name || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">型番</dt>
              <dd className="font-semibold text-gray-900">
                {product.model_no || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">メーカー</dt>
              <dd>{maker}</dd>
            </div>
            <div>
              <dt className="text-gray-500">シリーズ</dt>
              <dd>{seriesName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">カテゴリ</dt>
              <dd>{product.category || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">容量</dt>
              <dd>{capacity}</dd>
            </div>
            <div>
              <dt className="text-gray-500">標準仕入先</dt>
              <dd>{supplierName === "—" ? "未設定" : supplierName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">状態</dt>
              <dd>
                <span className={productStatusBadgeClass(product.is_active)}>
                  {productStatusLabel(product.is_active)}
                </span>
              </dd>
            </div>
            {product.memo ? (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">備考</dt>
                <dd className="whitespace-pre-wrap text-gray-800">
                  {product.memo}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="mx-auto mt-6 max-w-5xl">
          <h2 className="mb-2 text-lg font-bold text-gray-900">
            仕入・販売価格
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            この商品をどの仕入先からいくらで仕入れ、どの販売店へいくらで販売するかを確認できます。追加・編集は各価格画面から行います。
          </p>
          <MasterPricePanels
            targetType="PRODUCT"
            productId={id}
            defaultSupplierId={
              (product.default_supplier_id as string | null) || ""
            }
            defaultSupplierName={supplierName === "—" ? "" : supplierName}
          />
        </section>
      </main>
    </>
  );
}
