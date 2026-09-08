/** cases.memo / cases.construction_detail の【ラベル】形式（dealer / parseCaseExtras と互換） */

const REGISTRATION_MEMO_LABELS = [
  "納品先名称",
  "荷受け担当者",
  "荷受け電話番号",
] as const;

/** parseCaseExtras / dealer 登録と同一ラベル集合 */
const CONSTRUCTION_DETAIL_LABELS = [
  "施工店名",
  "施工店担当者",
  "施工店電話番号",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace or remove labeled blocks in cases.memo without duplicating labels.
 * Unlabeled free text in memo is preserved.
 */
export function upsertLabeledMemoFields(
  memo: string | null | undefined,
  fields: Partial<Record<(typeof REGISTRATION_MEMO_LABELS)[number], string>>
): string | null {
  let result = (memo || "").trim();

  for (const label of REGISTRATION_MEMO_LABELS) {
    const value = (fields[label] || "").trim();
    const pattern = new RegExp(`\\n?【${escapeRegExp(label)}】[^\\n【]*`, "g");
    result = result.replace(pattern, "").replace(/\n{2,}/g, "\n").trim();

    if (value) {
      const block = `【${label}】${value}`;
      result = result ? `${result}\n${block}` : block;
    }
  }

  return result.replace(/\n{2,}/g, "\n").trim() || null;
}

export function buildCaseRegistrationMemo(params: {
  delivery_name?: string;
  receiver_name: string;
  delivery_phone: string;
}): string | null {
  return upsertLabeledMemoFields(null, {
    納品先名称: params.delivery_name || "",
    荷受け担当者: params.receiver_name,
    荷受け電話番号: params.delivery_phone,
  });
}

export function buildCaseRegistrationConstructionDetail(params: {
  contractor_name: string;
}): string | null {
  const lines = [
    params.contractor_name.trim()
      ? `【施工店名】${params.contractor_name.trim()}`
      : "",
  ];
  const result = lines.filter(Boolean).join("\n");
  return result || null;
}

function parseLabeledConstructionFields(
  detail: string | null | undefined
): Record<(typeof CONSTRUCTION_DETAIL_LABELS)[number], string> {
  const empty = {
    施工店名: "",
    施工店担当者: "",
    施工店電話番号: "",
  };
  if (!detail || !detail.trim()) return empty;

  // 値は同一行のみ（改行後の自由記述を飲み込まない）
  const pattern = new RegExp(
    `【(${CONSTRUCTION_DETAIL_LABELS.map(escapeRegExp).join("|")})】([^\\n【]*)`,
    "g"
  );
  const result = { ...empty };
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(detail)) !== null) {
    const label = match[1] as (typeof CONSTRUCTION_DETAIL_LABELS)[number];
    const value = match[2].trim();
    if (value) result[label] = value;
  }
  return result;
}

/** 【ラベル】行を除いた自由記述（工事内容） */
export function extractConstructionBody(
  detail: string | null | undefined
): string {
  if (!detail) return "";
  return detail
    .replace(
      new RegExp(
        `【(?:${CONSTRUCTION_DETAIL_LABELS.map(escapeRegExp).join("|")})】[^\\n【]*`,
        "g"
      ),
      ""
    )
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * 案件編集用: construction_detail を施工店名 + 工事内容に分解。
 * 他ラベル（担当者・電話）は保存時に previous から維持する。
 */
export function parseConstructionDetailForEdit(
  detail: string | null | undefined
): {
  contractor_name: string;
  construction_body: string;
} {
  const fields = parseLabeledConstructionFields(detail);
  return {
    contractor_name: fields.施工店名,
    construction_body: extractConstructionBody(detail),
  };
}

/**
 * 案件編集保存用: 施工店名を更新しつつ、既存の担当者・電話ラベルと自由記述を維持。
 * 登録時の 【施工店名】 契約・dealer 形式と互換。
 */
export function buildConstructionDetailForEdit(params: {
  contractor_name: string;
  construction_body: string;
  previous_detail?: string | null;
}): string | null {
  const previous = parseLabeledConstructionFields(params.previous_detail);
  const lines = [
    params.contractor_name.trim()
      ? `【施工店名】${params.contractor_name.trim()}`
      : "",
    previous.施工店担当者
      ? `【施工店担当者】${previous.施工店担当者}`
      : "",
    previous.施工店電話番号
      ? `【施工店電話番号】${previous.施工店電話番号}`
      : "",
    params.construction_body.trim(),
  ];
  const result = lines.filter(Boolean).join("\n").trim();
  return result || null;
}
