import Link from "next/link";
import { notFound } from "next/navigation";

import MasterDeleteButton from "@/app/components/masters/MasterDeleteButton";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function text(value: string | null | undefined): string {
  const t = (value || "").trim();
  return t || "—";
}

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("contractors")
    .select(
      "id, name, postal_code, address, phone, delivery_name, delivery_address, delivery_phone, receiver_name, memo, is_active"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">
          施工店の取得に失敗しました：{error.message}
        </p>
        <Link
          href="/contractors"
          className="mt-4 inline-block text-sm text-gray-700 underline"
        >
          ← 施工店一覧へ戻る
        </Link>
      </main>
    );
  }

  if (!data) notFound();

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">施工店詳細</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {text(data.name) === "—" ? "名称未設定" : text(data.name)}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              状態: {data.is_active ? "有効" : "無効"}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href="/contractors"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              ← 一覧へ戻る
            </Link>
            <Link
              href={`/contractors/${data.id}/edit`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
            >
              編集
            </Link>
            <MasterDeleteButton
              kind="contractor"
              id={data.id}
              name={data.name || ""}
              listHref="/contractors"
            />
          </div>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">基本情報</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Info label="施工店名" value={data.name} />
            <Info label="郵便番号" value={data.postal_code} />
            <Info label="所在地" value={data.address} />
            <Info label="電話番号" value={data.phone} />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">標準納品先</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Info label="納品先名" value={data.delivery_name} />
            <Info label="納品先住所" value={data.delivery_address} />
            <Info label="納品先電話" value={data.delivery_phone} />
            <Info label="荷受け担当者" value={data.receiver_name} />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-gray-900">備考</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {text(data.memo)}
          </p>
          <p className="mt-4 text-xs text-gray-500">
            施工店は案件へ ID
            参照されず、案件登録時に値がコピーされます。運用停止は編集画面の「無効化」を利用できます。
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
      <p className="mt-1 text-sm text-gray-900">{text(value)}</p>
    </div>
  );
}
