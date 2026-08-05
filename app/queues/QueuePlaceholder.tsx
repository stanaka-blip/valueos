export default function QueuePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-gray-200/80 bg-white px-6 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </header>
      <main className="p-6 md:p-8">
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-base font-semibold text-gray-900">
            {title}（準備中）
          </p>
          <p className="mt-2 text-sm text-gray-500">
            一覧ロジックは次フェーズで実装します。サイドバー導線のみ先行しています。
          </p>
        </div>
      </main>
    </div>
  );
}
