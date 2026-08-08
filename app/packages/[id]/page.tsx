import Link from "next/link";
import { notFound } from "next/navigation";

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

type PackageItemRow = {
  id: string;
  quantity: number | string | null;
  products:
    | {
        name: string | null;
        model_no: string | null;
      }
    | {
        name: string | null;
        model_no: string | null;
      }[]
    | null;
};

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: pkg, error: pkgError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase
        .from("packages")
        .select(
          `
      id,
      name,
      package_code,
      capacity,
      capacity_unit,
      warranty_years,
      system_type,
      memo,
      is_active,
      default_supplier_id,
      manufacturers ( name ),
      series:series_id ( name ),
      suppliers:default_supplier_id ( name )
    `
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("package_items")
        .select(
          `
      id,
      quantity,
      products (
        name,
        model_no
      )
    `
        )
        .eq("package_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  if (pkgError) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">
          パッケージの取得に失敗しました：{pkgError.message}
        </p>
        <Link
          href="/packages"
          className="mt-4 inline-block text-sm text-gray-700 underline"
        >
          ← パッケージ一覧へ戻る
        </Link>
      </main>
    );
  }

  if (!pkg) {
    notFound();
  }

  const maker = relationName(pkg.manufacturers);
  const seriesName = relationName(pkg.series);
  const supplierName = relationName(pkg.suppliers);
  const capacity =
    pkg.capacity != null && pkg.capacity !== ""
      ? `${pkg.capacity}${pkg.capacity_unit || ""}`
      : "—";
  const warranty =
    pkg.warranty_years != null ? `${pkg.warranty_years}年` : "—";

  const composition = ((items || []) as PackageItemRow[]).map((item) => {
    const product = Array.isArray(item.products)
      ? item.products[0]
      : item.products;
    return {
      id: item.id,
      modelNo: product?.model_no || "—",
      name: product?.name || "—",
      quantity: item.quantity ?? "—",
    };
  });

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">パッケージ商品詳細</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {pkg.name || "名称未設定"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              コード: {pkg.package_code || "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/packages"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              ← パッケージ一覧へ戻る
            </Link>
            <Link
              href={`/packages/${id}/edit`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              編集
            </Link>
            <Link
              href={`/prices/new?package_id=${id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              仕入価格を追加
            </Link>
            <Link
              href={`/sales-prices/new?package_id=${id}`}
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
              <dt className="text-gray-500">パッケージ名</dt>
              <dd className="font-semibold text-gray-900">{pkg.name || "—"}</dd>
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
              <dt className="text-gray-500">容量</dt>
              <dd>{capacity}</dd>
            </div>
            <div>
              <dt className="text-gray-500">保証</dt>
              <dd>{warranty}</dd>
            </div>
            <div>
              <dt className="text-gray-500">標準仕入先</dt>
              <dd>{supplierName === "—" ? "未設定" : supplierName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">状態</dt>
              <dd>
                {pkg.is_active ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                    有効
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-bold text-gray-700">
                    停止
                  </span>
                )}
              </dd>
            </div>
            {pkg.system_type ? (
              <div>
                <dt className="text-gray-500">システム種別</dt>
                <dd>{pkg.system_type}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="mx-auto mt-6 max-w-5xl rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            パッケージ構成商品
          </h2>
          {itemsError ? (
            <p className="text-sm text-red-600">
              構成商品の取得に失敗しました：{itemsError.message}
            </p>
          ) : composition.length === 0 ? (
            <p className="text-sm text-gray-600">構成商品は登録されていません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">型番</th>
                    <th className="px-3 py-2">商品名</th>
                    <th className="px-3 py-2">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {composition.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">{row.modelNo}</td>
                      <td className="px-3 py-2 font-semibold">{row.name}</td>
                      <td className="px-3 py-2">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <MasterPricePanels
          targetType="PACKAGE"
          packageId={id}
          defaultSupplierId={(pkg.default_supplier_id as string | null) || ""}
          defaultSupplierName={supplierName === "—" ? "" : supplierName}
        />
      </main>
    </>
  );
}
