import { PRICE_TARGET_OPTIONS } from "@/lib/prices/targetType";

type Option = { id: string; name: string };

type Props = {
  action: "/prices" | "/sales-prices";
  partnerLabel: string;
  partnerParamName: "supplier_id" | "dealer_id";
  q: string;
  partnerId: string;
  manufacturerId: string;
  priceTargetType: string;
  category: string;
  status: "all" | "active" | "inactive";
  partners: Option[];
  manufacturers: Option[];
  categories: string[];
  resultCount: number;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export default function PriceListSearchForm({
  action,
  partnerLabel,
  partnerParamName,
  q,
  partnerId,
  manufacturerId,
  priceTargetType,
  category,
  status,
  partners,
  manufacturers,
  categories,
  resultCount,
}: Props) {
  return (
    <form
      action={action}
      method="get"
      className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="block text-sm font-medium text-gray-700 md:col-span-3 lg:col-span-6">
          検索
          <input
            className={fieldClass}
            type="search"
            name="q"
            defaultValue={q}
            placeholder="型番 / コード・商品名 / パッケージ名・メーカーで検索"
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          {partnerLabel}
          <select
            className={fieldClass}
            name={partnerParamName}
            defaultValue={partnerId}
          >
            <option value="">すべて</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
          区分
          <select
            className={fieldClass}
            name="price_target_type"
            defaultValue={priceTargetType}
          >
            <option value="">すべて</option>
            {PRICE_TARGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          カテゴリ
          <select className={fieldClass} name="category" defaultValue={category}>
            <option value="">すべて</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
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

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            検索
          </button>
          <a
            href={action}
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
