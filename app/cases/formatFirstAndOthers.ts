/**
 * 一覧セル用: 先頭1件 + 残り件数。
 * 例) labels=["ダイキン","三菱","日立"] → "ダイキン\n他2件"
 */
export function formatFirstAndOthers(
  labels: ReadonlyArray<string | null | undefined>,
  emptyLabel = "—"
): string {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const raw of labels) {
    const v = String(raw || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    unique.push(v);
  }

  if (unique.length === 0) return emptyLabel;
  if (unique.length === 1) return unique[0];
  return `${unique[0]}\n他${unique.length - 1}件`;
}
