import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const { data: packages, error } = await supabase
    .from("packages")
    .select(
      `
      id,
      name,
      package_code,
      capacity,
      capacity_unit,
      system_type,
      warranty_years,
      is_active,
      manufacturers (
        name
      )
    `
    )
    .order("name", { ascending: true });

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">パッケージ商品</h1>
          <p className="text-sm text-gray-500">
            メーカー・シリーズ別のパッケージ構成を確認します
          </p>
        </div>
      </header>

      <main className="p-8">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-5 py-4">メーカー</th>
                <th className="px-5 py-4">システム種別</th>
                <th className="px-5 py-4">容量</th>
                <th className="px-5 py-4">コード</th>
                <th className="px-5 py-4">パッケージ名</th>
                <th className="px-5 py-4">保証年数</th>
                <th className="px-5 py-4">状態</th>
              </tr>
            </thead>

            <tbody>
              {error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-red-500">
                    データ取得エラー：{error.message}
                  </td>
                </tr>
              ) : packages && packages.length > 0 ? (
                packages.map((item) => {
                  const manufacturer = item.manufacturers as
                    | { name: string | null }
                    | { name: string | null }[]
                    | null;
                  const makerName = Array.isArray(manufacturer)
                    ? manufacturer[0]?.name
                    : manufacturer?.name;

                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="px-5 py-4 font-semibold">
                        {makerName || "-"}
                      </td>
                      <td className="px-5 py-4">{item.system_type || "-"}</td>
                      <td className="px-5 py-4">
                        {item.capacity != null
                          ? `${item.capacity}${item.capacity_unit || ""}`
                          : "-"}
                      </td>
                      <td className="px-5 py-4">{item.package_code || "-"}</td>
                      <td className="px-5 py-4 font-semibold">
                        {item.name || "-"}
                      </td>
                      <td className="px-5 py-4">
                        {item.warranty_years != null
                          ? `${item.warranty_years}年`
                          : "-"}
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
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                    パッケージ商品が登録されていません。
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
