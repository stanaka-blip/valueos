/**
 * 3社間の実質回収・二重登録ガード（純関数）。
 * finance_receipts / dealer_settlements を正とし、payments とは混ぜない。
 */

export type FinanceReceiptStatusRow = {
  status: string | null | undefined;
};

export type DealerSettlementPaidRow = {
  status: string | null | undefined;
  actualPayoutAmount?: number | null;
  payoutAmount?: number | null;
};

/** 取消以外の有効信販入金（予定 or 入金済）があるか */
export function hasActiveFinanceReceipt(
  receipts: ReadonlyArray<FinanceReceiptStatusRow> | undefined
): boolean {
  if (!receipts) return false;
  for (const r of receipts) {
    const s = String(r.status || "").trim();
    if (s === "入金済" || s === "予定") return true;
  }
  return false;
}

export function hasPaidFinanceReceiptStatus(
  receipts: ReadonlyArray<FinanceReceiptStatusRow> | undefined
): boolean {
  if (!receipts) return false;
  for (const r of receipts) {
    if (String(r.status || "").trim() === "入金済") return true;
  }
  return false;
}

/**
 * 二重登録ブロック理由。
 * 入金済 or 予定（旧データ）があれば新規 create 不可。
 */
export function financeReceiptCreateBlockReason(
  receipts: ReadonlyArray<FinanceReceiptStatusRow> | undefined
): string | null {
  if (!receipts) return null;
  for (const r of receipts) {
    const s = String(r.status || "").trim();
    if (s === "入金済") {
      return "この案件には既に信販入金（入金済）があります。二重登録はできません。";
    }
    if (s === "予定") {
      return "この案件には未確定の信販入金（予定）があります。入金済にするか取消してから登録してください。";
    }
  }
  return null;
}

function floorMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value);
}

/** 販売店へ支払済み額（支払済の actual 優先、なければ payout） */
export function sumDealerPaidAmount(
  settlements: ReadonlyArray<DealerSettlementPaidRow> | undefined
): number {
  if (!settlements) return 0;
  let sum = 0;
  for (const s of settlements) {
    if (String(s.status || "").trim() !== "支払済") continue;
    const actual = s.actualPayoutAmount;
    if (actual != null && Number.isFinite(Number(actual))) {
      sum += floorMoney(Number(actual));
      continue;
    }
    sum += floorMoney(Number(s.payoutAmount) || 0);
  }
  return sum;
}

/**
 * 実質回収額 = 信販入金額 − 販売店支払額
 * 未入金残高 = 商品請求額 − 実質回収額
 * 信販未入金時は financePaidAmount=null → 実質回収0、未入金=請求額
 */
export function computeThreePartyRecoveryAmounts(input: {
  invoiceTotalAmount: number;
  /** 入金済の信販実入金額。未登録なら null */
  financePaidAmount: number | null;
  dealerPaidAmount: number;
}): {
  effectiveRecoveryAmount: number;
  unpaidBalance: number;
} {
  const invoice = floorMoney(Number(input.invoiceTotalAmount) || 0);
  const finance =
    input.financePaidAmount == null
      ? 0
      : floorMoney(Number(input.financePaidAmount) || 0);
  const dealer = floorMoney(Number(input.dealerPaidAmount) || 0);
  const effectiveRecoveryAmount = finance - dealer;
  const unpaidBalance = invoice - effectiveRecoveryAmount;
  return { effectiveRecoveryAmount, unpaidBalance };
}
