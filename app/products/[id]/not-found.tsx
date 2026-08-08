import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-bold text-gray-900">商品が見つかりません</h1>
      <p className="mt-2 text-sm text-gray-600">
        指定された商品は存在しないか、削除されています。
      </p>
      <Link
        href="/products"
        className="mt-6 inline-block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
      >
        ← 商品一覧へ戻る
      </Link>
    </main>
  );
}
