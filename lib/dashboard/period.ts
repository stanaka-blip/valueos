/**
 * ダッシュボード表示期間ユーティリティ（業務判定は含まない）
 */

export type PeriodPreset =
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_12_months"
  | "custom";

export type DashboardPeriod = {
  preset: PeriodPreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  /** 売上推移の粒度 */
  grain: "day" | "month";
};

export function todayString(now = new Date()): string {
  return formatYmd(now);
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

function daysInclusive(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 0;
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export function resolveGrain(
  preset: PeriodPreset,
  from: string,
  to: string
): "day" | "month" {
  if (preset === "this_month" || preset === "last_month") return "day";
  if (preset === "this_year" || preset === "last_12_months") return "month";
  // カスタム: 62日以内は日別、それ超は月別
  return daysInclusive(from, to) <= 62 ? "day" : "month";
}

export function resolvePeriod(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): DashboardPeriod {
  const now = input.now || new Date();
  const today = formatYmd(now);
  const preset = (input.preset || "this_month") as PeriodPreset;

  if (preset === "custom") {
    const from = input.from && parseYmd(input.from) ? input.from : today;
    const to = input.to && parseYmd(input.to) ? input.to : today;
    const ordered = from <= to ? { from, to } : { from: to, to: from };
    return {
      preset: "custom",
      ...ordered,
      grain: resolveGrain("custom", ordered.from, ordered.to),
    };
  }

  if (preset === "last_month") {
    const firstThis = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    const lastPrev = new Date(firstThis);
    lastPrev.setDate(0);
    const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1, 12);
    const from = formatYmd(firstPrev);
    const to = formatYmd(lastPrev);
    return { preset, from, to, grain: "day" };
  }

  if (preset === "this_year") {
    const from = `${now.getFullYear()}-01-01`;
    const to = today;
    return { preset, from, to, grain: "month" };
  }

  if (preset === "last_12_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1, 12);
    const from = formatYmd(start);
    const to = today;
    return { preset, from, to, grain: "month" };
  }

  // this_month (default)
  const from = formatYmd(new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12);
  const to = formatYmd(last);
  return { preset: "this_month", from, to, grain: "day" };
}

/** created_at / date 文字列が [from, to] に含まれるか（日付部分比較） */
export function isDateInRange(
  value: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day >= from && day <= to;
}

export function periodBucketKey(
  value: string | null | undefined,
  grain: "day" | "month"
): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return grain === "month" ? day.slice(0, 7) : day;
}

export function enumerateBuckets(
  from: string,
  to: string,
  grain: "day" | "month"
): string[] {
  const keys: string[] = [];
  if (grain === "month") {
    const start = parseYmd(from.slice(0, 8) + "01");
    const end = parseYmd(to.slice(0, 8) + "01");
    if (!start || !end) return keys;
    const cursor = new Date(start);
    while (cursor <= end) {
      keys.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end) return keys;
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(formatYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export const PERIOD_PRESET_OPTIONS: {
  value: PeriodPreset;
  label: string;
}[] = [
  { value: "this_month", label: "今月" },
  { value: "last_month", label: "先月" },
  { value: "this_year", label: "今年" },
  { value: "last_12_months", label: "過去12ヶ月" },
  { value: "custom", label: "カスタム" },
];
