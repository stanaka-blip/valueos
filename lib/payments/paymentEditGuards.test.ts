import assert from "node:assert/strict";
import {
  assertPaymentCancelAllowed,
  assertPaymentEditable,
  assertPaymentUpdateAllowed,
  isPaymentRecordStatus,
} from "./paymentEditGuards";

function testEditable() {
  assert.equal(assertPaymentEditable("入金確認済"), null);
  assert.equal(assertPaymentEditable("確認待ち"), null);
  assert.match(assertPaymentEditable("取消") ?? "", /取消/);
}

function testUpdateOk() {
  // 請求 1,000,000 / 他入金 600,000 / 編集 300→400 → 合計 1,000,000 OK
  assert.equal(
    assertPaymentUpdateAllowed({
      invoiceAmount: 1_000_000,
      otherActivePaymentsSum: 600_000,
      nextPaymentAmount: 400_000,
      paymentStatus: "入金確認済",
    }),
    null,
  );
}

function testUpdateRejectOverpay() {
  // 請求 1,000,000 / 他 600,000 / 編集 300→500 → 1,100,000 reject
  const err = assertPaymentUpdateAllowed({
    invoiceAmount: 1_000_000,
    otherActivePaymentsSum: 600_000,
    nextPaymentAmount: 500_000,
    paymentStatus: "入金確認済",
  });
  assert.ok(err);
  assert.match(err!, /請求額/);
}

function testUpdateCancelledRejected() {
  const err = assertPaymentUpdateAllowed({
    invoiceAmount: 1_000_000,
    otherActivePaymentsSum: 0,
    nextPaymentAmount: 100_000,
    paymentStatus: "取消",
  });
  assert.ok(err);
  assert.match(err!, /取消/);
}

function testCancel() {
  assert.equal(assertPaymentCancelAllowed("入金確認済"), null);
  assert.match(assertPaymentCancelAllowed("取消") ?? "", /取消/);
}

function testStatusHelper() {
  assert.equal(isPaymentRecordStatus("入金確認済"), true);
  assert.equal(isPaymentRecordStatus("確認待ち"), true);
  assert.equal(isPaymentRecordStatus("取消"), true);
  assert.equal(isPaymentRecordStatus("不正"), false);
}

testEditable();
testUpdateOk();
testUpdateRejectOverpay();
testUpdateCancelledRejected();
testCancel();
testStatusHelper();
console.log("paymentEditGuards: ok");
