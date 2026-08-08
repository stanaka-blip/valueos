import Link from "next/link";

import PriceListSearchForm from "@/app/components/prices/PriceListSearchForm";
import {
  collectPriceListCategories,
  filterPriceListRows,
  parsePriceListQuery,
  type PriceListFilterRow,
} from "@/lib/prices/priceListQuery";
import {
  resolveTargetDisplay,
  type PackageRel,
  type ProductRel,
} from "@/lib/prices/resolveTargetDisplay";
import { priceTargetLabel } from "@/lib/prices/targetType";
import { supabase } from "@/lib/supabase";

import SalesPriceActions from "./SalesPriceActions";

export const dynamic = "force-dynamic";

type Option = { id: string; name: string };

function toOptions(
  rows: Array<{ id: string; name: string | null }> | null | undefined
): Option[] {
  return (rows || [])
    .map((r) => ({
      id: r.id,
      name: (r.name || "").trim() || "名称未設定",
    }))
    .filter((r) => r.id);
}

export default async function SalesPricesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    dealer_id?: string;
    manufacturer_id?: string;
    price_target_type?: string;
    category?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const query = parsePriceListQuery({
    ...params,
    partnerParam: "dealer_id",
  });

  const [
    { data: prices, error: pricesError },
    { data: manufacturers },
    { data: dealers },
  ] = await Promise.all([
    supabase
      .from("sales_prices")
      .select(
        `
      *,
      dealers (
        name
      ),
      products (
        name,
        model_no,
        category,
        manufacturer_id,
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
        manufacturer_id,
        manufacturers (
          name
        )
      )
    `
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("manufacturers")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("dealers")
      .select("id, name, is_active")
      .order("name", { ascending: true }),
  ]);

  let rows = prices;
  let error = pricesError;

  // price_target_type / package_id 未適用環境向けフォールバック
  if (
    error &&
    /price_target_type|package_id|packages|schema cache|manufacturer_id/i.test(
      error.message
    )
  ) {
    ({ data: rows, error } = await supabase
      .from("sales_prices")
      .select(
        `
        *,
        dealers (
          name
        ),
        products (
          name,
          model_no,
          category,
          manufacturers (
            name
          )
        )
      `
      )
      .order("created_at", { ascending: false }));
  }

  const listRows: PriceListFilterRow[] = ((rows || []) as Array<
    Record<string, unknown>
  >).map((item) => {
    const targetType =
      (item.price_target_type as string | null) || "PRODUCT";
    const product = item.products as ProductRel;
    const pkg = item.packages as PackageRel;
    const display = resolveTargetDisplay(targetType, product, pkg);
    return {
      id: String(item.id),
      partnerId: ((item.dealer_id as string | null) || "").trim() || null,
      manufacturerId: display.manufacturerId,
      manufacturerName: display.maker === "-" ? "" : display.maker,
      priceTargetType: targetType,
      category: display.category,
      code: display.code,
      name: display.name,
      is_active: item.is_active,
    };
  });

  const filtered = filterPriceListRows(listRows, query);
  const visibleIds = new Set(filtered.map((r) => r.id));
  const visible = ((rows || []) as Array<Record<string, unknown>>).filter(
    (item) => visibleIds.has(String(item.id))
  );

  const categories = collectPriceListCategories(
    listRows,
    query.manufacturerId || undefined
  );

  const manufacturerOptions = toOptions(
    manufacturers as Array<{ id: string; name: string | null }> | null
  );
  const dealerOptions = toOptions(
    (
      (dealers || []) as Array<{
        id: string;
        name: string | null;
        is_active: unknown;
      }>
    )
      .filter(
        (d) =>
          d.is_active === true ||
          d.is_active === "true" ||
          d.is_active == null
      )
      .map((d) => ({ id: d.id, name: d.name }))
  );

  const hasFilters =
    Boolean(query.q) ||
    Boolean(query.partnerId) ||
    Boolean(query.manufacturerId) ||
    Boolean(query.priceTargetType) ||
    Boolean(query.category) ||
    query.status !== "all";

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">販売価格一覧</h1>
            <p className="text-sm text-gray-500">
              販売店ごとの商品・パッケージ商品販売価格を管理します
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/sales-prices/bulk-by-dealer"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-800"
            >
              販売店ごとに一括登録
            </Link>
            <Link
              href="/sales-prices/new"
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
            >
              ＋ 販売価格登録
            </Link>
          </div>
        </div>
      </header>

      <main className="p-8">
        <PriceListSearchForm
          action="/sales-prices"
          partnerLabel="販売店"
          partnerParamName="dealer_id"
          q={query.q}
          partnerId={query.partnerId}
          manufacturerId={query.manufacturerId}
          priceTargetType={query.priceTargetType}
          category={query.category}
          status={query.status}
          partners={dealerOptions}
          manufacturers={manufacturerOptions}
          categories={categories}
          resultCount={visible.length}
        />

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">販売店</th>
                <th className="px-5 py-4">価格対象</th>
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">区分</th>
                <th className="px-5 py-4">品番 / コード</th>
                <th className="px-5 py-4">名称</th>
                <th className="px-5 py-4">販売価格</th>
                <th className="px-5 py-4">適用開始</th>
                <th className="px-5 py-4">適用終了</th>
                <th className="px-5 py-4">状態</th>
                <th className="px-5 py-4 text-center">操作</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-5 py-10 text-center text-red-500"
                  >
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : visible.length > 0 ? (
                visible.map((item) => {
                  const targetType =
                    (item.price_target_type as string | null) || "PRODUCT";
                  const product = item.products as ProductRel;
                  const pkg = item.packages as PackageRel;
                  const display = resolveTargetDisplay(
                    targetType,
                    product,
                    pkg
                  );

                  return (
                    <tr
                      key={String(item.id)}
                      className="border-t hover:bg-gray-50"
                    >
                      <td className="px-5 py-4 font-semibold">
                        {(item.dealers as { name: string | null } | null)
                          ?.name || "-"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                          {priceTargetLabel(targetType)}
                        </span>
                      </td>
                      <td className="px-5 py-4">{display.maker}</td>
                      <td className="px-5 py-4">{display.category}</td>
                      <td className="px-5 py-4">{display.code}</td>
                      <td className="px-5 py-4 font-semibold">
                        {display.name}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {item.sales_price
                          ? `${Number(item.sales_price).toLocaleString()}円`
                          : "-"}
                      </td>
                      <td className="px-5 py-4">
                        {(item.start_date as string | null) || "-"}
                      </td>
                      <td className="px-5 py-4">
                        {(item.end_date as string | null) || "-"}
                      </td>
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
                        <SalesPriceActions id={String(item.id)} />
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
                    {hasFilters
                      ? "条件に一致する販売価格がありません。"
                      : "販売価格が登録されていません。"}
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
