/**
 * 納品完了判定の単一契約テスト
 * Run: npx tsx lib/orders/deliveryStatus.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  areAllActiveOrdersDelivered,
  areAllOrdersDeliveredForInvoice,
  hasDeliveredMissingDate,
  isOrderDelivered,
} from "./deliveryStatus";

test("isOrderDelivered: status=納品済", () => {
  assert.equal(isOrderDelivered({ status: "納品済", deliveredDate: null }), true);
});

test("isOrderDelivered: 実納品日のみ（statusは発注済）", () => {
  assert.equal(
    isOrderDelivered({ status: "発注済", deliveredDate: "2026-07-10" }),
    true
  );
});

test("isOrderDelivered: 未納品", () => {
  assert.equal(
    isOrderDelivered({ status: "発注済", deliveredDate: null }),
    false
  );
});

test("areAllActiveOrdersDelivered: 実納品日のみでも完納", () => {
  assert.equal(
    areAllActiveOrdersDelivered([
      { status: "発注済", deliveredDate: "2026-07-10" },
    ]),
    true
  );
});

test("areAllOrdersDeliveredForInvoice: 実納品日のみでも請求可", () => {
  assert.equal(
    areAllOrdersDeliveredForInvoice([
      { status: "発注済", deliveredDate: "2026-07-10" },
    ]),
    true
  );
});

test("areAllOrdersDeliveredForInvoice: statusのみ・日付なしは請求不可", () => {
  assert.equal(
    areAllOrdersDeliveredForInvoice([
      { status: "納品済", deliveredDate: null },
    ]),
    false
  );
  assert.equal(
    hasDeliveredMissingDate([{ status: "納品済", deliveredDate: null }]),
    true
  );
});

test("areAllOrdersDeliveredForInvoice: 一部未納", () => {
  assert.equal(
    areAllOrdersDeliveredForInvoice([
      { status: "発注済", deliveredDate: "2026-07-10" },
      { status: "発注済", deliveredDate: null },
    ]),
    false
  );
});

test("キャンセル発注は完納判定から除外", () => {
  assert.equal(
    areAllOrdersDeliveredForInvoice([
      { status: "発注済", deliveredDate: "2026-07-10" },
      { status: "キャンセル", deliveredDate: null },
    ]),
    true
  );
  assert.equal(
    areAllActiveOrdersDelivered([
      { status: "取消", deliveredDate: null },
    ]),
    false
  );
});
