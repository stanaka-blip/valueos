const MEMO_LABELS = [
  "案件備考",
  "販売店担当者",
  "顧客名カナ",
  "郵便番号",
  "納品先区分",
  "納品先名称",
  "納品先郵便番号",
  "荷受け担当者",
  "荷受け電話番号",
  "荷受け可能時間",
  "納品時注意事項",
] as const;

const CONSTRUCTION_LABELS = [
  "施工店名",
  "施工店担当者",
  "施工店電話番号",
] as const;

export type ParsedCaseExtras = {
  dealerContact: string | null;
  customerNameKana: string | null;
  postalCode: string | null;
  deliveryType: string | null;
  deliveryName: string | null;
  deliveryPostalCode: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receivingHours: string | null;
  deliveryNotes: string | null;
  caseMemo: string | null;
  contractorName: string | null;
  contractorContact: string | null;
  contractorPhone: string | null;
};

function parseLabeledText(
  text: string | null | undefined,
  labels: readonly string[]
): Record<string, string> {
  const result: Record<string, string> = {};

  if (!text || !text.trim()) {
    return result;
  }

  const pattern = new RegExp(
    `【(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})】([^【]*)`,
    "g"
  );

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[2].trim();
    if (value) {
      result[match[1]] = value;
    }
  }

  return result;
}

/**
 * Extract dealer-order extras that were stored in cases.memo /
 * cases.construction_detail because dedicated columns do not exist.
 */
export function parseCaseExtras(params: {
  memo: string | null | undefined;
  constructionDetail: string | null | undefined;
}): ParsedCaseExtras {
  const memoFields = parseLabeledText(params.memo, MEMO_LABELS);
  const constructionFields = parseLabeledText(
    params.constructionDetail,
    CONSTRUCTION_LABELS
  );

  return {
    dealerContact: memoFields["販売店担当者"] || null,
    customerNameKana: memoFields["顧客名カナ"] || null,
    postalCode: memoFields["郵便番号"] || null,
    deliveryType: memoFields["納品先区分"] || null,
    deliveryName: memoFields["納品先名称"] || null,
    deliveryPostalCode: memoFields["納品先郵便番号"] || null,
    receiverName: memoFields["荷受け担当者"] || null,
    receiverPhone: memoFields["荷受け電話番号"] || null,
    receivingHours: memoFields["荷受け可能時間"] || null,
    deliveryNotes: memoFields["納品時注意事項"] || null,
    caseMemo: memoFields["案件備考"] || null,
    contractorName: constructionFields["施工店名"] || null,
    contractorContact: constructionFields["施工店担当者"] || null,
    contractorPhone: constructionFields["施工店電話番号"] || null,
  };
}

export function displayValue(value: string | null | undefined): string {
  if (value == null) {
    return "未登録";
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : "未登録";
}
