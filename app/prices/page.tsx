import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { priceTargetLabel } from "@/lib/prices/targetType";
import PriceActions from "./PriceActions";

export const dynamic = "force-dynamic";

type ManufacturerRel = { name: string | null } | null;

type ProductRel = {
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: ManufacturerRel;
} | null;

type PackageRel = {
  name: string | null;
  package_code: string | null;
  capacity: number | string | null;
  capacity_unit: string | null;
  system_type: string | null;
  manufacturers: ManufacturerRel;
} | null;

export default async function PricesPage() {
  let { data: prices, error } = await supabase
    .from("purchase_prices")
    .select(
      `
      *,
      products (
        name,
        model_no,
        category,
        manufacturers (
          name
        )
      ),
      packages (
        name,
        package_code,
        capacity,
        capacity_unit,
        system_type,
        manufacturers (
          name
        )
      ),
      suppliers (
        name
      )
    `
    )
    .order("created_at", { ascending: false });

  // price_target_type / package_id 未適用環境向けフォールバック
  if (
    error &&
    /price_target_type|package_id|packages|schema cache/i.test(error.message)
  ) {
    ({ data: prices, error } = await supabase
      .from("purchase_prices")
      .select(
        `
        *,
        products (
          name,
          model_no,
          category,
          manufacturers (
            name
          )
        ),
        suppliers (
          name
        )
      `
      )
      .order("created_at", { ascending: false }));
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">仕入価格一覧</h1>
            <p className="text-sm text-gray-500">
              商品・パッケージ商品の仕入先別価格を管理します
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/prices/bulk-by-supplier"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-800"
            >
              仕入先ごとに一括登録
            </Link>
            <Link
              href="/prices/new"
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
            >
              ＋ 価格登録
            </Link>
          </div>
        </div>
      </header>

      <main className="p-8">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">価格対象</th>
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">区分</th>
                <th className="px-5 py-4">品番 / コード</th>
                <th className="px-5 py-4">名称</th>
                <th className="px-5 py-4">仕入先</th>
                <th className="px-5 py-4">仕入価格</th>
                <th className="px-5 py-4">適用開始</th>
                <th className="px-5 py-4">適用終了</th>
                <th className="px-5 py-4">状態</th>
                <th className="px-5 py-4 text-center">操作</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : prices && prices.length > 0 ? (
                prices.map((item) => {
                  const targetType =
                    (item.price_target_type as string | null) || "PRODUCT";
                  const product = item.products as ProductRel;
                  const pkg = item.packages as PackageRel;
                  const display = resolveTargetDisplay(targetType, product, pkg);

                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                          {priceTargetLabel(targetType)}
                        </span>
                      </td>
                      <td className="px-5 py-4">{display.maker}</td>
                      <td className="px-5 py-4">{display.category}</td>
                      <td className="px-5 py-4">{display.code}</td>
                      <td className="px-5 py-4 font-semibold">{display.name}</td>
                      <td className="px-5 py-4">
                        {(item.suppliers as { name: string | null } | null)?.name ||
                          "-"}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {item.purchase_price
                          ? `${Number(item.purchase_price).toLocaleString()}円`
                          : "-"}
                      </td>
                      <td className="px-5 py-4">{item.start_date || "-"}</td>
                      <td className="px-5 py-4">{item.end_date || "-"}</td>
                      <td className="px-5 py-4">
                        {item.is_active ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                            有効
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-700">
                            停止
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <PriceActions id={item.id} />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={11}
                    className="px-5 py-10 text-center text-gray-500"
                  >
                    価格が登録されていません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function resolveTargetDisplay(
  targetType: string,
  product: ProductRel,
  pkg: PackageRel
) {
  if (targetType === "PACKAGE") {
    const capacity =
      pkg?.capacity != null && pkg.capacity !== ""
        ? `${pkg.capacity}${pkg.capacity_unit || ""}`
        : "-";
    return {
      maker: pkg?.manufacturers?.name || "-",
      category: pkg?.system_type || capacity,
      code: pkg?.package_code || "-",
      name: pkg?.name || "-",
    };
  }

  return {
    maker: product?.manufacturers?.name || "-",
    category: product?.category || "-",
    code: product?.model_no || "-",
    name: product?.name || "-",
  };
}
