type ManufacturerOption = { id: string; name: string };
type Props = {
  q: string;
  manufacturerId: string;
  status: "all" | "active" | "inactive";
  manufacturers: ManufacturerOption[];
  resultCount: number;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export default function PackageListSearchForm({
  q,
  manufacturerId,
  status,
  manufacturers,
  resultCount,
}: Props) {
  return (
    <form
      action="/packages"
      method="get"
      className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-3 md:grid-cols-4">
        <label className="block text-sm font-medium text-gray-700 md:col-span-4">
          検索
          <input
            className={fieldClass}
            type="search"
            name="q"
            defaultValue={q}
            placeholder="パッケージ名・メーカー名・シリーズ名で検索"
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          メーカー
          <select
            className={fieldClass}
            name="manufacturer_id"
            defaultValue={manufacturerId}
          >
            <option value="">すべて</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          状態
          <select className={fieldClass} name="status" defaultValue={status}>
            <option value="all">すべて</option>
            <option value="active">有効</option>
            <option value="inactive">無効</option>
          </select>
        </label>

        <div className="flex items-end gap-2 md:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            検索
          </button>
          <a
            href="/packages"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
          >
            クリア
          </a>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-600">{resultCount}件</p>
    </form>
  );
}
