import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
  suppliers: {
    name: string | null;
  } | null;
};

export default async function DealerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("dealers")
    .select(`
      *,
      suppliers (
        name
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <>
        <header className="border-b bg-white px-8 py-5">
          <h1 className="text-2xl font-bold text-gray-900">販売店詳細</h1>
        </header>

        <main className="p-8">
          <div className="rounded-xl bg-red-50 p-6 text-red-700">
            販売店取得エラー：
            {error?.message || "販売店が見つかりません"}
          </div>
        </main>
      </>
    );
  }

  const dealer = data as DealerDetail;

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {dealer.name || "販売店詳細"}
            </h1>
            <p className="text-sm text-gray-500">
              販売店情報・取引条件を確認します
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dealers"
              className="rounded-lg border px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
            >
              一覧へ戻る
            </Link>

            <Link
              href={`/dealers/edit/${dealer.id}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              編集
            </Link>
          </div>
        </div>
      </header>

      <main className="space-y-6 p-8">
        <section className="rounded-xl bg-white p-6 shadow-sm">
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

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">取引条件</h2>

          <div className="grid gap-5 md:grid-cols-2">
            <Info label="決済条件" value={dealer.payment_type} />
            <Info
              label="売掛上限"
              value={
                dealer.credit_limit !== null
                  ? `${Number(dealer.credit_limit).toLocaleString()}円`
                  : "-"
              }
            />
            <Info
              label="デフォルト仕入先"
              value={dealer.suppliers?.name}
            />
            <Info
              label="デフォルト利益"
              value={
                dealer.default_profit_amount !== null
                  ? `${Number(
                      dealer.default_profit_amount
                    ).toLocaleString()}円`
                  : "-"
              }
            />
            <Info
              label="デフォルト担当営業"
              value={dealer.default_sales_person}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">状態</h2>

          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              dealer.is_active
                ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {dealer.is_active ? "有効" : "停止"}
          </span>
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">運用メモ</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {dealer.default_memo || "運用メモはありません。"}
          </p>
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">備考</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {dealer.memo || "備考はありません。"}
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
      <p className="mt-1 text-sm text-gray-900">{value || "-"}</p>
    </div>
  );
}