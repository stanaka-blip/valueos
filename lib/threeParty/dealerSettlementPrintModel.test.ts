import assert from "node:assert/strict";

import { buildDealerSettlementPrintModel } from "./dealerSettlementPrintModel";

const model = buildDealerSettlementPrintModel({
  credit_received_amount: 2_340_000,
  ve_share_amount: 916_300,
  payout_amount: 1_423_150,
  adjustment_total_amount: 550,
  lines: [
    {
      id: "1",
      line_kind: "credit_in",
      description: "クレジット会社入金額",
      amount: 2_340_000,
      sort_order: 1,
    },
    {
      id: "2",
      line_kind: "ve_share",
      description: "弊社売上金額",
      amount: 916_300,
      sort_order: 2,
    },
    {
      id: "3",
      line_kind: "transfer_fee",
      description: "振込手数料",
      amount: 550,
      sort_order: 3,
    },
  ],
});

assert.equal(model.creditReceivedAmount, 2_340_000);
assert.equal(model.veShareAmount, 916_300);
assert.equal(model.transferFeeTotal, 550);
assert.equal(model.otherAdjustmentLines.length, 0);
assert.equal(model.recomputedPayout, 1_423_150);
assert.equal(model.payoutAmount, 1_423_150);

const withAdj = buildDealerSettlementPrintModel({
  credit_received_amount: 100_000,
  ve_share_amount: 40_000,
  payout_amount: 49_000,
  adjustment_total_amount: 11_000,
  lines: [
    {
      id: "a",
      line_kind: "transfer_fee",
      description: "手数料",
      amount: 1_000,
      sort_order: 1,
    },
    {
      id: "b",
      line_kind: "discount",
      description: "値引き",
      amount: 10_000,
      sort_order: 2,
    },
  ],
});
assert.equal(withAdj.transferFeeTotal, 1_000);
assert.equal(withAdj.otherAdjustmentLines.length, 1);
assert.ok(withAdj.otherAdjustmentLines[0].label.includes("値引き"));
assert.equal(withAdj.recomputedPayout, 49_000);

console.log("dealerSettlementPrintModel.test.ts: ok");
