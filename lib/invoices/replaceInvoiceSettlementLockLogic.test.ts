/**
 * Pure logic mirror of replace_invoice settlement lock gate.
 * Mirrors SQL:
 *   case_id IS NOT NULL
 *   AND case_has_locking_dealer_settlement(case_id)
 *   AND invoice_amount IS DISTINCT FROM original_amount
 */
import assert from "node:assert/strict";

function caseHasLockingDealerSettlement(
  statuses: ReadonlyArray<string | null | undefined>,
): boolean {
  return statuses.some((s) => {
    const t = (s ?? "").trim();
    return t === "確定" || t === "支払済";
  });
}

function replaceInvoiceSettlementGate(input: {
  caseId: string | null;
  lockingStatuses: ReadonlyArray<string | null | undefined>;
  originalAmount: number;
  nextAmount: number;
}): "allow" | "reject_amount_change" {
  if (
    input.caseId != null &&
    caseHasLockingDealerSettlement(input.lockingStatuses) &&
    input.nextAmount !== input.originalAmount
  ) {
    return "reject_amount_change";
  }
  return "allow";
}

// 1. 仕切なし → 成功
assert.equal(
  replaceInvoiceSettlementGate({
    caseId: "c1",
    lockingStatuses: [],
    originalAmount: 1_122_000,
    nextAmount: 1_200_000,
  }),
  "allow",
);

// 2. 未確定の仕切あり → 成功
assert.equal(
  replaceInvoiceSettlementGate({
    caseId: "c1",
    lockingStatuses: ["下書き", "取消"],
    originalAmount: 1_122_000,
    nextAmount: 1_200_000,
  }),
  "allow",
);

// 3. 確定 + 請求額変更なし → 成功
assert.equal(
  replaceInvoiceSettlementGate({
    caseId: "c1",
    lockingStatuses: ["確定"],
    originalAmount: 1_122_000,
    nextAmount: 1_122_000,
  }),
  "allow",
);

// 4. 支払済 + 請求額変更なし → 成功
assert.equal(
  replaceInvoiceSettlementGate({
    caseId: "c1",
    lockingStatuses: ["支払済"],
    originalAmount: 1_122_000,
    nextAmount: 1_122_000,
  }),
  "allow",
);

// 5. 確定 + 請求額変更 → 拒否
assert.equal(
  replaceInvoiceSettlementGate({
    caseId: "c1",
    lockingStatuses: ["確定"],
    originalAmount: 1_122_000,
    nextAmount: 1_200_000,
  }),
  "reject_amount_change",
);

// 6. 支払済 + 請求額変更 → 拒否
assert.equal(
  replaceInvoiceSettlementGate({
    caseId: "c1",
    lockingStatuses: ["支払済"],
    originalAmount: 1_122_000,
    nextAmount: 1_000_000,
  }),
  "reject_amount_change",
);

console.log("replaceInvoiceSettlementLockLogic: ok");
