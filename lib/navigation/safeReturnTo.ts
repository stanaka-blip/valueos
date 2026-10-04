/**
 * ValueOS 内部 returnTo のサニタイズ（オープンリダイレクト防止）。
 * 商品一覧専用は app/products/productListQuery.ts の sanitizeProductsReturnTo を優先。
 */

const ALLOWED_PREFIXES = [
  "/cases",
  "/invoices",
  "/orders",
  "/payments",
  "/products",
  "/packages",
  "/dealers",
  "/suppliers",
  "/manufacturers",
  "/contractors",
  "/prices",
  "/sales-prices",
  "/queues",
  "/admin",
  "/staff",
  "/settings",
] as const;

function decodeMaybe(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function isAllowedInternalPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.includes("://")) return false;
  if (path.includes("\\")) return false;
  const pathOnly = path.split("?")[0] || path;
  return ALLOWED_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  );
}

/**
 * returnTo を ValueOS 内部パスだけに制限する。
 * 不正・外部URLは null（呼び出し側で fallback）。
 */
export function sanitizeValueOsReturnTo(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const decoded = decodeMaybe(raw);
  if (!decoded) return null;
  if (!isAllowedInternalPath(decoded)) return null;
  return decoded;
}

export function withReturnTo(path: string, returnTo: string | null): string {
  if (!returnTo) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}returnTo=${encodeURIComponent(returnTo)}`;
}

/** returnTo があれば優先、なければ fallback */
export function resolveBackHref(
  returnTo: string | null | undefined,
  fallback: string
): string {
  return sanitizeValueOsReturnTo(returnTo) || fallback;
}
