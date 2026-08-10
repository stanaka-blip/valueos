/**
 * 仕切清算の純関数（PR1）。
 *
 * payout = credit_received - ve_share - Σ(adjustment amounts)
 * 調整明細の amount は控除額を正数で保持する。
 */

export const DEALER_SETTLEMENT_ADJUSTMENT_KINDS = [
  "transfer_fee",
  "discount",
  "offset",
  "other",
] as const;

export type DealerSettlementAdjustmentKind =
  (typeof DEALER_SETTLEMENT_ADJUSTMENT_KINDS)[number];

export const DEALER_SETTLEMENT_LINE_KINDS = [
  "credit_in",
  "ve_share",
  ...DEALER_SETTLEMENT_ADJUSTMENT_KINDS,
] as const;

export type DealerSettlementLineKind =
  (typeof DEALER_SETTLEMENT_LINE_KINDS)[number];

export type DealerSettlementAdjustmentLineInput = {
  line_kind: string;
  amount: number | string | null | undefined;
};

export type DealerSettlementCalcInput = {
  /** 信販会社入金額（税込想定の実入金 snapshot） */
  creditReceivedAmount: number | string | null | undefined;
  /** Value Ecology 請求/取り分 */
  veShareAmount: number | string | null | undefined;
  /** 控除調整明細（transfer_fee / discount / offset / other） */
  adjustmentLines?: readonly DealerSettlementAdjustmentLineInput[];
};

export type DealerSettlementCalcResult = {
  creditReceivedAmount: number;
  veShareAmount: number;
  adjustmentTotalAmount: number;
  /** credit - ve_share - adjustments（円未満は各入力を floor 後に演算） */
  payoutAmount: number;
};

function toFiniteNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 金額は円単位。負値は 0 に落とさず、呼び出し側バリデーションに委ねる場合は raw を使う */
export function floorMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value);
}

export function isDealerSettlementAdjustmentKind(
  kind: string
): kind is DealerSettlementAdjustmentKind {
  return (DEALER_SETTLEMENT_ADJUSTMENT_KINDS as readonly string[]).includes(
    kind
  );
}

/** 調整明細のみ合算（正数控除）。credit_in / ve_share 行は無視。 */
export function sumDealerSettlementAdjustments(
  lines: readonly DealerSettlementAdjustmentLineInput[] | undefined
): number {
  if (!lines || lines.length === 0) return 0;
  let sum = 0;
  for (const line of lines) {
    const kind = String(line.line_kind || "").trim();
    if (!isDealerSettlementAdjustmentKind(kind)) continue;
    sum += floorMoney(toFiniteNumber(line.amount));
  }
  return sum;
}

/**
 * novis 例:
 * 2,340,000 - 916,300 - 550 = 1,423,150
 */
export function calculateDealerSettlementPayout(
  input: DealerSettlementCalcInput
): DealerSettlementCalcResult {
  const creditReceivedAmount = floorMoney(
    toFiniteNumber(input.creditReceivedAmount)
  );
  const veShareAmount = floorMoney(toFiniteNumber(input.veShareAmount));
  const adjustmentTotalAmount = sumDealerSettlementAdjustments(
    input.adjustmentLines
  );
  const payoutAmount =
    creditReceivedAmount - veShareAmount - adjustmentTotalAmount;

  return {
    creditReceivedAmount,
    veShareAmount,
    adjustmentTotalAmount,
    payoutAmount,
  };
}

/** 確定 snapshot 用に計算結果をヘッダ列へ写す */
export function toDealerSettlementAmountSnapshot(
  calc: DealerSettlementCalcResult
) {
  return {
    credit_received_amount: calc.creditReceivedAmount,
    ve_share_amount: calc.veShareAmount,
    adjustment_total_amount: calc.adjustmentTotalAmount,
    payout_amount: calc.payoutAmount,
  };
}
