/**
 * 仕切清算書 print 用の表示モデル（純関数）。
 * 請求書とは別書類。計算式は header snapshot を表示するのみ。
 */

export type DealerSettlementPrintLine = {
  id: string;
  line_kind: string;
  description: string;
  amount: number;
  sort_order: number;
};

export type DealerSettlementPrintInput = {
  credit_received_amount: number;
  ve_share_amount: number;
  payout_amount: number;
  adjustment_total_amount: number;
  lines: DealerSettlementPrintLine[];
};

export type DealerSettlementPrintModel = {
  creditReceivedAmount: number;
  veShareAmount: number;
  transferFeeTotal: number;
  otherAdjustmentLines: Array<{
    id: string;
    label: string;
    amount: number;
  }>;
  payoutAmount: number;
  /** 御振込 = 入金 − VE − 手数料 − その他調整（表示検証用） */
  recomputedPayout: number;
};

function toAmount(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function buildDealerSettlementPrintModel(
  input: DealerSettlementPrintInput
): DealerSettlementPrintModel {
  const lines = [...input.lines].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );

  const transferFeeTotal = lines
    .filter((l) => l.line_kind === "transfer_fee")
    .reduce((s, l) => s + toAmount(l.amount), 0);

  const otherAdjustmentLines = lines
    .filter(
      (l) =>
        l.line_kind === "discount" ||
        l.line_kind === "offset" ||
        l.line_kind === "other"
    )
    .map((l) => {
      const suffix =
        l.line_kind === "discount"
          ? "（値引き）"
          : l.line_kind === "offset"
            ? "（相殺）"
            : "（その他）";
      return {
        id: l.id,
        label: `${l.description || l.line_kind}${suffix}`,
        amount: toAmount(l.amount),
      };
    });

  const otherTotal = otherAdjustmentLines.reduce((s, l) => s + l.amount, 0);
  const credit = toAmount(input.credit_received_amount);
  const ve = toAmount(input.ve_share_amount);

  return {
    creditReceivedAmount: credit,
    veShareAmount: ve,
    transferFeeTotal,
    otherAdjustmentLines,
    payoutAmount: toAmount(input.payout_amount),
    recomputedPayout: credit - ve - transferFeeTotal - otherTotal,
  };
}
