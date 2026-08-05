/** cases.memo / cases.construction_detail の【ラベル】形式（dealer / parseCaseExtras と互換） */

export function buildCaseRegistrationMemo(params: {
  delivery_phone: string;
}): string | null {
  const lines = [
    params.delivery_phone.trim()
      ? `【荷受け電話番号】${params.delivery_phone.trim()}`
      : "",
  ];
  const result = lines.filter(Boolean).join("\n");
  return result || null;
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
