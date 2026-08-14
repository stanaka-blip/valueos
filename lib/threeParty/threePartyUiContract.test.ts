import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { moneyActionApiPath } from "./moneyActionPaths";
import { buildDealerSettlementPrintModel } from "./dealerSettlementPrintModel";

const root = process.cwd();
const panels = readFileSync(
  join(root, "app/cases/[id]/ThreePartyMoneyPanels.tsx"),
  "utf8"
);
const caseDetail = readFileSync(
  join(root, "app/cases/[id]/CaseDetailView.tsx"),
  "utf8"
);
const submit = readFileSync(
  join(root, "app/cases/[id]/submitThreePartyMoney.ts"),
  "utf8"
);
const printPage = readFileSync(
  join(root, "app/dealer-settlements/[id]/print/page.tsx"),
  "utf8"
);

// 独立イベント: 仕入先支払 create に信販入金フィールドを要求しない
assert.ok(panels.includes("信販入金の有無は問いません"));
assert.ok(caseDetail.includes("支払管理"));
assert.ok(caseDetail.includes("variant=\"case_flow\""));
assert.ok(caseDetail.includes("金額・債務を確定する画面"));
assert.ok(caseDetail.includes("決済条件を編集"));
assert.ok(panels.includes("case_flow"));
assert.ok(panels.includes("/queues/payments-management"));
assert.ok(panels.includes("信販入金の予定を追加登録") || panels.includes("予定登録"));
assert.ok(panels.includes("hidePay"));
assert.ok(!panels.includes('.from("finance_receipts")'));
assert.ok(!panels.includes('.from("dealer_settlements")'));
assert.ok(!panels.includes('.from("supplier_payments")'));
assert.ok(submit.includes("Idempotency-Key"));
assert.ok(submit.includes("X-CSRF-Token"));
assert.ok(submit.includes("Content-Type"));

// 仕入先支払は finance_receipt なしで API path が取れる
assert.equal(
  moneyActionApiPath({
    action: "supplier_payment.create",
    caseId: "11111111-1111-4111-8111-111111111111",
  }),
  "/api/cases/11111111-1111-4111-8111-111111111111/supplier-payments"
);

// 御振込金額の目立つ表示・計算式
assert.ok(panels.includes("販売店への御振込金額"));
assert.ok(panels.includes("確定（金額を固定）"));
assert.ok(panels.includes("確定済みの仕切金額は直接編集できません"));

// print 必須項目
for (const label of [
  "仕切清算書",
  "販売店",
  "案件番号",
  "顧客名",
  "発行日",
  "契約日",
  "納品日",
  "信販会社",
  "クレジット会社入金額",
  "弊社売上金額",
  "振込手数料",
  "御振込金額",
  "備考",
  "請求書とは別書類",
]) {
  assert.ok(printPage.includes(label), `print missing: ${label}`);
}

const model = buildDealerSettlementPrintModel({
  credit_received_amount: 1000,
  ve_share_amount: 300,
  payout_amount: 650,
  adjustment_total_amount: 50,
  lines: [
    {
      id: "1",
      line_kind: "transfer_fee",
      description: "手数料",
      amount: 50,
      sort_order: 1,
    },
  ],
});
assert.equal(model.recomputedPayout, 650);

console.log("threePartyUiContract.test.ts: ok");
