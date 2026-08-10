/**
 * 3社間金銭アクション → Gateway API path（クライアント/テスト共用）。
 */

export function moneyActionApiPath(input: {
  action: string;
  caseId: string;
  resourceId?: string;
}): string | null {
  const { action, caseId, resourceId } = input;
  switch (action) {
    case "finance_receipt.create":
      return `/api/cases/${caseId}/finance-receipts`;
    case "finance_receipt.confirm":
      return `/api/finance-receipts/${resourceId}/confirm`;
    case "finance_receipt.cancel":
      return `/api/finance-receipts/${resourceId}/cancel`;
    case "finance_receipt.correct":
      return `/api/finance-receipts/${resourceId}/correct`;
    case "dealer_settlement.create":
      return `/api/cases/${caseId}/dealer-settlements`;
    case "dealer_settlement.confirm":
      return `/api/dealer-settlements/${resourceId}/confirm`;
    case "dealer_settlement.pay":
      return `/api/dealer-settlements/${resourceId}/pay`;
    case "dealer_settlement.cancel":
      return `/api/dealer-settlements/${resourceId}/cancel`;
    case "dealer_settlement.correct":
      return `/api/dealer-settlements/${resourceId}/correct`;
    case "supplier_payment.create":
      return `/api/cases/${caseId}/supplier-payments`;
    case "supplier_payment.pay":
      return `/api/supplier-payments/${resourceId}/pay`;
    case "supplier_payment.cancel":
      return `/api/supplier-payments/${resourceId}/cancel`;
    case "supplier_payment.correct":
      return `/api/supplier-payments/${resourceId}/correct`;
    default:
      return null;
  }
}

export const THREE_PARTY_UI_STATUS_LABELS = [
  "入金予定",
  "入金済",
  "支払予定",
  "支払済",
  "期限超過",
  "取消",
  "下書き",
  "未入金",
] as const;

export function dealerSettlementPrintPath(settlementId: string): string {
  return `/dealer-settlements/${settlementId}/print`;
}
