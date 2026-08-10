import Link from "next/link";
import { notFound } from "next/navigation";

import MasterDeleteButton from "@/app/components/masters/MasterDeleteButton";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type DealerDetail = {
  id: string;
  name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_type: string | null;
  credit_limit: number | null;
  sales_person: string | null;
  memo: string | null;
  default_profit_amount: number | null;
  default_sales_person: string | null;
  default_memo: string | null;
  is_active: boolean | null;
  suppliers: { name: string | null } | { name: string | null }[] | null;
};

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

function yen(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

export default async function DealerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [
    { data, error },
    { count: caseCount, error: caseError },
    { data: salesPrices, error: salesError },
  ] = await Promise.all([
    supabase
      .from("dealers")
      .select(
        `
      *,
      suppliers (
        name
      )
    `
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", id),
    supabase
      .from("sales_prices")
      .select("id, product_id, sales_price, start_date, end_date, is_active")
      .eq("dealer_id", id)
      .order("start_date", { ascending: false })
      .limit(20),
  ]);

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">
          販売店の取得に失敗しました：{error.message}
        </p>
        <Link
          href="/dealers"
          className="mt-4 inline-block text-sm text-gray-700 underline"
        >
          ← 販売店一覧へ戻る
        </Link>
      </main>
    );
  }

  if (!data) notFound();

  const dealer = data as DealerDetail;

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">販売店詳細</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {dealer.name || "名称未設定"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              状態: {dealer.is_active ? "有効" : "停止"}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href="/dealers"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              ← 一覧へ戻る
            </Link>
            <Link
              href={`/dealers/${dealer.id}/edit`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              編集
            </Link>
            <Link
              href={`/sales-prices/bulk-by-dealer?dealer_id=${dealer.id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              販売価格を一括設定
            </Link>
            <MasterDeleteButton
              kind="dealer"
              id={dealer.id}
              name={dealer.name || ""}
              listHref="/dealers"
            />
          </div>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">基本情報</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Info label="販売店名" value={dealer.name} />
            <Info label="担当者名" value={dealer.contact_name} />
            <Info label="電話番号" value={dealer.phone} />
            <Info label="メール" value={dealer.email} />
            <Info label="住所" value={dealer.address} />
            <Info label="担当営業" value={dealer.sales_person} />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">取引条件</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Info label="決済条件" value={dealer.payment_type} />
            <Info label="売掛上限" value={yen(dealer.credit_limit)} />
            <Info
              label="デフォルト仕入先"
              value={relationName(dealer.suppliers)}
            />
            <Info
              label="デフォルト利益"
              value={yen(dealer.default_profit_amount)}
            />
            <Info
              label="デフォルト担当営業"
              value={dealer.default_sales_person}
            />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-gray-900">関連案件</h2>
          {caseError ? (
            <p className="text-sm text-red-600">{caseError.message}</p>
          ) : (
            <p className="text-sm text-gray-700">
              紐づく案件:{" "}
              <span className="font-semibold">{caseCount ?? 0}件</span>
            </p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">販売価格</h2>
            <Link
              href={`/sales-prices?dealer_id=${dealer.id}`}
              className="text-sm font-medium text-gray-800 underline"
            >
              販売価格一覧へ
            </Link>
          </div>
          {salesError ? (
            <p className="text-sm text-red-600">{salesError.message}</p>
          ) : salesPrices && salesPrices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">販売価格</th>
                    <th className="px-3 py-2">開始日</th>
                    <th className="px-3 py-2">終了日</th>
                    <th className="px-3 py-2">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {salesPrices.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-semibold">
                        {yen(row.sales_price as number | null)}
                      </td>
                      <td className="px-3 py-2">
                        {(row.start_date as string) || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {(row.end_date as string) || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.is_active ? "有効" : "停止"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {salesPrices.length >= 20 ? (
                <p className="mt-2 text-xs text-gray-500">
                  直近 20 件まで表示しています。
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500">販売価格は未登録です。</p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-gray-900">運用メモ</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {dealer.default_memo || "—"}
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-gray-900">備考</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {dealer.memo || "—"}
          </p>
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
      <p className="mt-1 text-sm text-gray-900">{value || "—"}</p>
    </div>
  );
}
