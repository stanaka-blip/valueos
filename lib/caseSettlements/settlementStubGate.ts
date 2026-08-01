/**
 * settlement API stub の発火条件。
 * Production / Preview（Vercel）および NODE_ENV=production では絶対に許可しない。
 * ローカル開発テストのみ ALLOW_GATEWAY_SETTLEMENT_STUB=1 で有効。
 */
export function isSettlementStubAllowed(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview") {
    return false;
  }
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return process.env.ALLOW_GATEWAY_SETTLEMENT_STUB === "1";
}
