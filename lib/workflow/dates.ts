/** YYYY-MM-DD → Date (UTC noon to avoid TZ edge) */
function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 指定日が属する月の月末 */
export function endOfMonth(dateStr: string): string | null {
  const d = parseDateOnly(dateStr);
  if (!d) return null;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
  return formatDateOnly(last);
}

/** 指定日が属する月の翌月末 */
export function endOfNextMonth(dateStr: string): string | null {
  const d = parseDateOnly(dateStr);
  if (!d) return null;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0, 12));
  return formatDateOnly(last);
}
