/**
 * Ver1.0 案件ステータス互換ヘルパー
 *
 * - 画面の選択・新規書込は正式9値のみ
 * - DBに残る旧表記・工事系は表示時に吸収（一括UPDATEしない）
 * - admin/orders の書込値（受付済み / 差し戻し 等）は読取互換で扱う
 */

export const CASE_STATUSES = [
  "新規受付",
  "受付済",
  "発注済",
  "納品済",
  "請求済",
  "入金済",
  "完了",
  "差戻し",
  "キャンセル",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

const CASE_STATUS_SET = new Set<string>(CASE_STATUSES);

/** 旧表記・別名 → 正式値 */
const ALIAS_TO_CANONICAL: Record<string, CaseStatus> = {
  受付済み: "受付済",
  差し戻し: "差戻し",
  取消: "キャンセル",
  // 表示用に近い業務ステータスへ寄せる（選択UIには出さない）
  内容確認中: "新規受付",
  見積作成中: "新規受付",
  見積提出済: "新規受付",
  受注確定: "受付済",
  発注待ち: "受付済",
  納期回答待ち: "発注済",
  納品待ち: "発注済",
  請求待ち: "納品済",
  入金待ち: "請求済",
  保留: "新規受付",
  // 工事系 → 完了寄り / 進行中は発注・納品の近似（表示用）
  工事日調整中: "納品済",
  工事待ち: "納品済",
  施工中: "納品済",
  完工: "完了",
};

const CASE_STATUS_STYLES: Record<CaseStatus, string> = {
  新規受付: "bg-gray-100 text-gray-700",
  受付済: "bg-sky-100 text-sky-800",
  発注済: "bg-indigo-100 text-indigo-700",
  納品済: "bg-emerald-100 text-emerald-700",
  請求済: "bg-violet-100 text-violet-700",
  入金済: "bg-emerald-200 text-emerald-800",
  完了: "bg-green-200 text-green-800",
  差戻し: "bg-orange-100 text-orange-800",
  キャンセル: "bg-gray-300 text-gray-600",
};

/** "'新規受付'" のような引用符付きを除去 */
export function normalizeCaseStatus(
  status: string | null | undefined
): string {
  if (!status) {
    return "";
  }

  return status.replace(/^['"]+|['"]+$/g, "").trim();
}

/**
 * DB値を正式9値へ寄せる。
 * 不明な値は null（呼び出し側で生値表示などを判断）。
 */
export function toCanonicalCaseStatus(
  status: string | null | undefined
): CaseStatus | null {
  const normalized = normalizeCaseStatus(status);

  if (!normalized) {
    return null;
  }

  if (CASE_STATUS_SET.has(normalized)) {
    return normalized as CaseStatus;
  }

  return ALIAS_TO_CANONICAL[normalized] || null;
}

/** 画面表示用ラベル（常に文字列を返す） */
export function getCaseStatusLabel(
  status: string | null | undefined
): string {
  const canonical = toCanonicalCaseStatus(status);

  if (canonical) {
    return canonical;
  }

  const normalized = normalizeCaseStatus(status);
  return normalized || "新規受付";
}

export function getCaseStatusBadgeClassName(
  status: string | null | undefined
): string {
  const canonical = toCanonicalCaseStatus(status);
  if (canonical) {
    return CASE_STATUS_STYLES[canonical];
  }

  return "bg-gray-100 text-gray-700";
}

export function isCaseStatus(
  value: string | null | undefined
): value is CaseStatus {
  const normalized = normalizeCaseStatus(value);
  return CASE_STATUS_SET.has(normalized);
}

/**
 * StatusSelect 用オプション。
 * 現在値が正式9値に含まれない場合のみ、表示互換のため現在値を1件追加する
 * （工事系を一覧に常時出さない）。
 */
export function getCaseStatusSelectOptions(
  currentStatus: string | null | undefined
): string[] {
  const options: string[] = [...CASE_STATUSES];
  const normalized = normalizeCaseStatus(currentStatus);
  const canonical = toCanonicalCaseStatus(currentStatus);

  if (
    normalized &&
    !CASE_STATUS_SET.has(normalized) &&
    !canonical &&
    !options.includes(normalized)
  ) {
    options.unshift(normalized);
  }

  return options;
}

/**
 * select の value に使う値。
 * エイリアスは正式値に寄せ、不明な旧値はそのまま（一時オプション表示用）。
 */
export function getCaseStatusSelectValue(
  currentStatus: string | null | undefined
): string {
  const canonical = toCanonicalCaseStatus(currentStatus);
  if (canonical) {
    return canonical;
  }

  const normalized = normalizeCaseStatus(currentStatus);
  return normalized || "新規受付";
}
