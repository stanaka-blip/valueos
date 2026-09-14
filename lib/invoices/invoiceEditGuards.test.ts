import assert from "node:assert/strict";
import {
  assertInvoiceAmountChangeAllowed,
  assertInvoiceCancelAllowed,
  assertInvoiceEditable,
  hasLockingDealerSettlement,
  sumConfirmedPaymentsForInvoiceGuard,
} from "./invoiceEditGuards";

function testSumConfirmedPayments() {
  const sum = sumConfirmedPaymentsForInvoiceGuard([
    { payment_amount: 300_000, status: "入金確認済" },
    { payment_amount: 200_000, status: "確認待ち" },
    { payment_amount: 100_000, status: "取消" },
    { payment_amount: 500_000, status: "入金確認済" },
  ]);
  assert.equal(sum, 800_000);
}

function testEditable() {
  assert.equal(assertInvoiceEditable("請求済"), null);
  assert.match(assertInvoiceEditable("取消") ?? "", /取消/);
}

function testAmountChangeRejectBelowPayments() {
  const err = assertInvoiceAmountChangeAllowed({
    invoiceStatus: "請求済",
    nextInvoiceAmount: 500_000,
    confirmedPaymentsSum: 800_000,
  });
  assert.ok(err);
  assert.match(err!, /確認済入金/);
}

function testAmountChangeOk() {
  assert.equal(
    assertInvoiceAmountChangeAllowed({
      invoiceStatus: "請求済",
      nextInvoiceAmount: 1_200_000,
      confirmedPaymentsSum: 800_000,
    }),
    null,
  );
}

function testAmountChangeBlockedBySettlement() {
  const err = assertInvoiceAmountChangeAllowed({
    invoiceStatus: "請求済",
    nextInvoiceAmount: 1_200_000,
    confirmedPaymentsSum: 0,
    dealerSettlementStatuses: ["確定"],
  });
  assert.ok(err);
  assert.match(err!, /仕切/);
}

function testCancelBlockedBySettlement() {
  const err = assertInvoiceCancelAllowed({
    invoiceStatus: "請求済",
    dealerSettlementStatuses: ["支払済"],
  });
  assert.ok(err);
  assert.match(err!, /仕切/);
}

function testCancelOk() {
  assert.equal(
    assertInvoiceCancelAllowed({
      invoiceStatus: "請求済",
      dealerSettlementStatuses: ["下書き", "取消"],
    }),
    null,
  );
}

function testHasLocking() {
  assert.equal(hasLockingDealerSettlement(["下書き"]), false);
  assert.equal(hasLockingDealerSettlement(["確定"]), true);
  assert.equal(hasLockingDealerSettlement(["支払済"]), true);
  assert.equal(hasLockingDealerSettlement(["取消"]), false);
}

testSumConfirmedPayments();
testEditable();
testAmountChangeRejectBelowPayments();
testAmountChangeOk();
testAmountChangeBlockedBySettlement();
testCancelBlockedBySettlement();
testCancelOk();
testHasLocking();
console.log("invoiceEditGuards: ok");
