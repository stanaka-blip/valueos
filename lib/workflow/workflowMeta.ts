/**
 * DDL 適用前の一時フォールバック用メタデータ。
 * case_settlements.memo に埋め込み、カラム追加後は正式カラムを優先する。
 *
 * 形式: ...text... __workflow_v1__:{"loan_status":"...","card_status":"...","construction_completed_date":"..."}
 */
export type WorkflowMeta = {
  loan_status?: string | null;
  card_status?: string | null;
  construction_completed_date?: string | null;
};

const META_PREFIX = "__workflow_v1__:";

export function parseWorkflowMeta(
  memo: string | null | undefined
): WorkflowMeta {
  if (!memo) return {};
  const idx = memo.indexOf(META_PREFIX);
  if (idx < 0) return {};
  const jsonPart = memo.slice(idx + META_PREFIX.length).trim();
  // JSON object only (first {...})
  const start = jsonPart.indexOf("{");
  if (start < 0) return {};
  let depth = 0;
  let end = -1;
  for (let i = start; i < jsonPart.length; i++) {
    if (jsonPart[i] === "{") depth++;
    if (jsonPart[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return {};
  try {
    return JSON.parse(jsonPart.slice(start, end + 1)) as WorkflowMeta;
  } catch {
    return {};
  }
}

export function stripWorkflowMeta(memo: string | null | undefined): string {
  if (!memo) return "";
  const idx = memo.indexOf(META_PREFIX);
  if (idx < 0) return memo;
  return memo.slice(0, idx).trimEnd();
}

export function writeWorkflowMeta(
  memo: string | null | undefined,
  meta: WorkflowMeta
): string {
  const base = stripWorkflowMeta(memo);
  const payload = JSON.stringify({
    loan_status: meta.loan_status ?? null,
    card_status: meta.card_status ?? null,
    construction_completed_date: meta.construction_completed_date ?? null,
  });
  if (!base) return `${META_PREFIX}${payload}`;
  return `${base}\n${META_PREFIX}${payload}`;
}
