import type { PriceTargetSummary } from "@/lib/prices/parsePriceNewPrefill";

type Props = {
  summary: PriceTargetSummary | null;
  missing?: boolean;
};

/** 一覧からのディープリンク時に、登録対象を上部表示する */
export default function PriceTargetPrefillBanner({ summary, missing }: Props) {
  if (missing) {
    return (
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        指定された対象が見つかりませんでした。下の選択から対象を選び直してください。
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold tracking-wide text-gray-500">
        登録対象（一覧から指定）
      </p>
      <p className="mt-1 text-base font-bold text-gray-900">
        [{summary.kindLabel}] {summary.name}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        メーカー: {summary.manufacturerName}
        <span className="mx-2 text-gray-300">|</span>
        {summary.codeLabel}: {summary.code}
      </p>
    </div>
  );
}
