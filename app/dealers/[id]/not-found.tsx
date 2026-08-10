import Link from "next/link";

export default function DealerNotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-bold text-gray-900">販売店が見つかりません</h1>
      <Link href="/dealers" className="mt-4 inline-block text-sm underline">
        ← 販売店一覧へ戻る
      </Link>
    </main>
  );
}
