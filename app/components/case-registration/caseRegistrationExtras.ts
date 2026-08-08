/** cases.memo / cases.construction_detail の【ラベル】形式（dealer / parseCaseExtras と互換） */

const REGISTRATION_MEMO_LABELS = [
  "納品先名称",
  "荷受け担当者",
  "荷受け電話番号",
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
