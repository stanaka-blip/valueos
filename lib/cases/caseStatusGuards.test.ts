/**
 * 案件ステータス手動変更ガード
 * Run: npx tsx lib/cases/caseStatusGuards.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canManuallySetCaseStatusToInvoiced,
  countActiveInvoices,
  MANUAL_INVOICED_STATUS_BLOCKED_MESSAGE,
  resolveCaseStatusAfterInvoiceCancel,
} from "./caseStatusGuards";

test("請求済への手動変更: 有効請求なしは不可", () => {
  const r = canManuallySetCaseStatusToInvoiced({
    nextStatus: "請求済",
    activeInvoiceCount: 0,
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.message, MANUAL_INVOICED_STATUS_BLOCKED_MESSAGE);
  }
});

test("請求済への手動変更: 有効請求ありは可", () => {
  const r = canManuallySetCaseStatusToInvoiced({
    nextStatus: "請求済",
    activeInvoiceCount: 1,
  });
  assert.equal(r.ok, true);
});

test("請求済以外への変更はガードしない", () => {
  const r = canManuallySetCaseStatusToInvoiced({
    nextStatus: "納品済",
    activeInvoiceCount: 0,
  });
  assert.equal(r.ok, true);
});

test("countActiveInvoices: 取消は除外", () => {
  assert.equal(
    countActiveInvoices([
      { status: "請求済" },
      { status: "取消" },
      { status: "入金待ち" },
    ]),
    2
  );
});

test("請求取消後: 有効請求0かつ請求済なら納品済へ", () => {
  assert.equal(
    resolveCaseStatusAfterInvoiceCancel({
      currentCaseStatus: "請求済",
      remainingActiveInvoiceCount: 0,
    }),
    "納品済"
  );
});

test("請求取消後: 他に有効請求があれば変更なし", () => {
  assert.equal(
    resolveCaseStatusAfterInvoiceCancel({
      currentCaseStatus: "請求済",
      remainingActiveInvoiceCount: 1,
    }),
    null
  );
});

test("請求取消後: 完了ステータスは変更なし", () => {
  assert.equal(
    resolveCaseStatusAfterInvoiceCancel({
      currentCaseStatus: "完了",
      remainingActiveInvoiceCount: 0,
    }),
    null
  );
});
