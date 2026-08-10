import assert from "node:assert/strict";

import {
  dealerSettlementPrintPath,
  moneyActionApiPath,
  THREE_PARTY_UI_STATUS_LABELS,
} from "./moneyActionPaths";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const RES_ID = "22222222-2222-4222-8222-222222222222";

const ACTIONS: Array<{ action: string; path: string }> = [
  {
    action: "finance_receipt.create",
    path: `/api/cases/${CASE_ID}/finance-receipts`,
  },
  {
    action: "finance_receipt.confirm",
    path: `/api/finance-receipts/${RES_ID}/confirm`,
  },
  {
    action: "finance_receipt.cancel",
    path: `/api/finance-receipts/${RES_ID}/cancel`,
  },
  {
    action: "finance_receipt.correct",
    path: `/api/finance-receipts/${RES_ID}/correct`,
  },
  {
    action: "dealer_settlement.create",
    path: `/api/cases/${CASE_ID}/dealer-settlements`,
  },
  {
    action: "dealer_settlement.confirm",
    path: `/api/dealer-settlements/${RES_ID}/confirm`,
  },
  {
    action: "dealer_settlement.pay",
    path: `/api/dealer-settlements/${RES_ID}/pay`,
  },
  {
    action: "dealer_settlement.cancel",
    path: `/api/dealer-settlements/${RES_ID}/cancel`,
  },
  {
    action: "dealer_settlement.correct",
    path: `/api/dealer-settlements/${RES_ID}/correct`,
  },
  {
    action: "supplier_payment.create",
    path: `/api/cases/${CASE_ID}/supplier-payments`,
  },
  {
    action: "supplier_payment.pay",
    path: `/api/supplier-payments/${RES_ID}/pay`,
  },
  {
    action: "supplier_payment.cancel",
    path: `/api/supplier-payments/${RES_ID}/cancel`,
  },
  {
    action: "supplier_payment.correct",
    path: `/api/supplier-payments/${RES_ID}/correct`,
  },
];

for (const row of ACTIONS) {
  const path = moneyActionApiPath({
    action: row.action,
    caseId: CASE_ID,
    resourceId: RES_ID,
  });
  assert.equal(path, row.path, row.action);
}

assert.equal(moneyActionApiPath({ action: "unknown", caseId: CASE_ID }), null);

// action namespace: create paths differ per resource family
const createPaths = new Set(
  ACTIONS.filter((a) => a.action.endsWith(".create")).map((a) => a.path)
);
assert.equal(createPaths.size, 3);

assert.equal(
  dealerSettlementPrintPath(RES_ID),
  `/dealer-settlements/${RES_ID}/print`
);

for (const label of [
  "入金予定",
  "入金済",
  "支払予定",
  "支払済",
  "期限超過",
  "取消",
] as const) {
  assert.ok(
    (THREE_PARTY_UI_STATUS_LABELS as readonly string[]).includes(label),
    label
  );
}

console.log("moneyActionPaths.test.ts: ok");
