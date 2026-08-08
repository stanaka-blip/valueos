import Link from "next/link";

export default function PackageNotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-bold text-gray-900">
        パッケージ商品が見つかりません
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        指定されたパッケージは存在しないか、削除されています。
      </p>
      <Link
        href="/packages"
        className="mt-6 inline-block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
      >
        ← パッケージ一覧へ戻る
      </Link>
    </main>
  );
}
