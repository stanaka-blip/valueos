import Link from "next/link";

export default function ContractorNotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-bold text-gray-900">施工店が見つかりません</h1>
      <Link href="/contractors" className="mt-4 inline-block text-sm underline">
        ← 施工店一覧へ戻る
      </Link>
    </main>
  );
}
