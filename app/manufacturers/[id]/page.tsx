import Link from "next/link";
import { notFound } from "next/navigation";

import MasterDeleteButton from "@/app/components/masters/MasterDeleteButton";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function text(value: string | null | undefined): string {
  const t = (value || "").trim();
  return t || "—";
}

export default async function ManufacturerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [
    { data: manufacturer, error },
    { data: series, error: seriesError },
    { data: products, error: productsError },
    { data: packages, error: packagesError },
  ] = await Promise.all([
    supabase.from("manufacturers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("product_series")
      .select("id, name, description, is_active")
      .eq("manufacturer_id", id)
      .order("name", { ascending: true })
      .limit(50),
    supabase
      .from("products")
      .select("id, name, model_no, category, is_active")
      .eq("manufacturer_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("packages")
      .select("id, name, package_code, is_active")
      .eq("manufacturer_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">
          メーカーの取得に失敗しました：{error.message}
        </p>
        <Link
          href="/manufacturers"
          className="mt-4 inline-block text-sm text-gray-700 underline"
        >
          ← メーカー一覧へ戻る
        </Link>
      </main>
    );
  }

  if (!manufacturer) notFound();

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">メーカー詳細</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {text(manufacturer.name as string)}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              状態: {manufacturer.is_active ? "稼働中" : "停止中"}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href="/manufacturers"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              ← 一覧へ戻る
            </Link>
            <Link
              href={`/manufacturers/${manufacturer.id}/edit`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              編集
            </Link>
            <Link
              href={`/series/new?manufacturer_id=${manufacturer.id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              シリーズを追加
            </Link>
            <MasterDeleteButton
              kind="manufacturer"
              id={manufacturer.id as string}
              name={(manufacturer.name as string) || ""}
              listHref="/manufacturers"
            />
          </div>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">基本情報</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Info label="メーカー名" value={manufacturer.name as string} />
            <Info
              label="区分"
              value={manufacturer.company_type as string | null}
            />
            <Info
              label="担当者"
              value={manufacturer.contact_name as string | null}
            />
            <Info label="電話番号" value={manufacturer.phone as string | null} />
            <Info label="メール" value={manufacturer.email as string | null} />
          </div>
          <div className="mt-5">
            <p className="text-xs font-bold text-gray-500">備考</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
              {text(manufacturer.memo as string | null)}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">シリーズ</h2>
            <Link href="/series" className="text-sm underline">
              シリーズ一覧へ
            </Link>
          </div>
          {seriesError ? (
            <p className="text-sm text-red-600">{seriesError.message}</p>
          ) : series && series.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {series.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <Link
                      href={`/series/${row.id}/edit`}
                      className="font-semibold text-gray-900 underline-offset-2 hover:underline"
                    >
                      {text(row.name)}
                    </Link>
                    {row.description ? (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {row.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-gray-600">
                    {row.is_active ? "有効" : "停止"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">シリーズは未登録です。</p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">商品</h2>
            <Link
              href={`/products?manufacturer_id=${manufacturer.id}`}
              className="text-sm underline"
            >
              商品一覧へ
            </Link>
          </div>
          {productsError ? (
            <p className="text-sm text-red-600">{productsError.message}</p>
          ) : products && products.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">型番</th>
                    <th className="px-3 py-2">商品名</th>
                    <th className="px-3 py-2">カテゴリ</th>
                    <th className="px-3 py-2">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Link
                          href={`/products/${row.id}`}
                          className="font-semibold underline-offset-2 hover:underline"
                        >
                          {text(row.model_no)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/products/${row.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {text(row.name)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{text(row.category)}</td>
                      <td className="px-3 py-2">
                        {row.is_active ? "有効" : "停止"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.length >= 30 ? (
                <p className="mt-2 text-xs text-gray-500">
                  直近 30 件まで表示しています。
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500">商品は未登録です。</p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">パッケージ</h2>
            <Link href="/packages" className="text-sm underline">
              パッケージ一覧へ
            </Link>
          </div>
          {packagesError ? (
            <p className="text-sm text-red-600">{packagesError.message}</p>
          ) : packages && packages.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {packages.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <Link
                      href={`/packages/${row.id}`}
                      className="font-semibold text-gray-900 underline-offset-2 hover:underline"
                    >
                      {text(row.name)}
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {text(row.package_code)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-600">
                    {row.is_active ? "有効" : "停止"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">パッケージは未登録です。</p>
          )}
        </section>
      </main>
    </>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{text(value)}</p>
    </div>
  );
}
