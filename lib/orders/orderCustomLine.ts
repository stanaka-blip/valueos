/**
 * 発注明細の自由入力行（単発費用等）。
 * Migration なし: order_items.memo に [VE_CUSTOM] マーカーで保存し product_id は null。
 * 商品マスタ・メーカーマスタへはレコードを作らない。
 */

export const VE_CUSTOM_PREFIX = "[VE_CUSTOM]";

const RESERVED_PREFIXES = ["[VE_PKG_AMT]", "[VE_PKG_COMP]", VE_CUSTOM_PREFIX];

function escapeCustomField(value: string): string {
  return (value || "").replace(/\|/g, "／").replace(/\r?\n/g, " ");
}

function unescapeCustomField(value: string): string {
  return (value || "").trim();
}

export function isCustomOrderLine(memo: string | null | undefined): boolean {
  return (memo || "").trim().startsWith(VE_CUSTOM_PREFIX);
}

export function buildCustomOrderItemMemo(input: {
  manufacturer?: string | null;
  lineName: string;
  userMemo?: string | null;
}): string {
  const manufacturer = escapeCustomField(input.manufacturer || "");
  const lineName = escapeCustomField(input.lineName);
  const userMemo = escapeCustomField(input.userMemo || "");
  return `${VE_CUSTOM_PREFIX}|${manufacturer}|${lineName}|${userMemo}`;
}

export function parseCustomOrderItemMemo(memo: string | null | undefined): {
  manufacturer: string;
  lineName: string;
  userMemo: string;
} | null {
  const raw = (memo || "").trim();
  if (!raw.startsWith(VE_CUSTOM_PREFIX + "|")) return null;
  const parts = raw.split("|");
  if (parts.length < 3) return null;
  const lineName = unescapeCustomField(parts[2] || "");
  if (!lineName) return null;
  const manufacturer = unescapeCustomField(parts[1] || "");
  const userMemo = unescapeCustomField(parts.slice(3).join("|"));
  return { manufacturer, lineName, userMemo };
}

export function displayCustomOrderLineUserMemo(
  memo: string | null | undefined
): string {
  return parseCustomOrderItemMemo(memo)?.userMemo || "";
}

export function validateCustomOrderLineName(lineName: string): string | null {
  const name = (lineName || "").trim();
  if (!name) {
    return "自由入力明細の明細名を入力してください。";
  }
  for (const prefix of RESERVED_PREFIXES) {
    if (name.startsWith(prefix)) {
      return "明細名にシステム予約語は使えません。";
    }
  }
  return null;
}

export function validateCustomOrderItemMemo(
  memo: string | null | undefined
): string | null {
  if (!isCustomOrderLine(memo)) {
    return "自由入力明細の形式が不正です。";
  }
  const parsed = parseCustomOrderItemMemo(memo);
  if (!parsed) {
    return "自由入力明細の明細名を入力してください。";
  }
  return validateCustomOrderLineName(parsed.lineName);
}
