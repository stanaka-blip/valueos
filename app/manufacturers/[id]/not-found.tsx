import Link from "next/link";

export default function ManufacturerNotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-bold text-gray-900">メーカーが見つかりません</h1>
      <Link
        href="/manufacturers"
        className="mt-4 inline-block text-sm underline"
      >
        ← メーカー一覧へ戻る
      </Link>
    </main>
  );
}
