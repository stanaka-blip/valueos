/**
 * 金銭イベント status 導出ユニットテスト
 *
 * 実行: npx tsx lib/threeParty/moneyEventStatus.test.ts
 */
import assert from "node:assert/strict";

import {
  isCancelledMoneyEventStatus,
  isDueDateOverdue,
  resolveDealerSettlementDisplayStatus,
  resolveFinanceReceiptDisplayStatus,
  resolveSupplierPaymentDisplayStatus,
} from "@/lib/threeParty/moneyEventStatus";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const today = "2026-08-10";

test("信販: 予定+日付なし → 未入金", () => {
  assert.equal(
    resolveFinanceReceiptDisplayStatus({ status: "予定", today }),
    "未入金"
  );
});

test("信販: 予定+未来日 → 入金予定", () => {
  assert.equal(
    resolveFinanceReceiptDisplayStatus({
      status: "予定",
      scheduledDate: "2026-08-15",
      today,
    }),
    "入金予定"
  );
});

test("信販: 予定+過去日 → 期限超過", () => {
  assert.equal(
    resolveFinanceReceiptDisplayStatus({
      status: "予定",
      scheduledDate: "2026-08-01",
      today,
    }),
    "期限超過"
  );
});

test("信販: 入金済 / 取消", () => {
  assert.equal(
    resolveFinanceReceiptDisplayStatus({ status: "入金済", today }),
    "入金済"
  );
  assert.equal(
    resolveFinanceReceiptDisplayStatus({
      status: "取消",
      scheduledDate: "2026-08-01",
      today,
    }),
    "取消"
  );
});

test("期限当日は超過にしない", () => {
  assert.equal(isDueDateOverdue({ dueDate: today, today }), false);
  assert.equal(
    resolveFinanceReceiptDisplayStatus({
      status: "予定",
      scheduledDate: today,
      today,
    }),
    "入金予定"
  );
});

test("販売店: 下書き / 確定=支払予定 / 支払済 / 取消", () => {
  assert.equal(
    resolveDealerSettlementDisplayStatus({ status: "下書き", today }),
    "下書き"
  );
  assert.equal(
    resolveDealerSettlementDisplayStatus({
      status: "確定",
      scheduledPayoutDate: "2026-08-20",
      today,
    }),
    "支払予定"
  );
  assert.equal(
    resolveDealerSettlementDisplayStatus({ status: "支払済", today }),
    "支払済"
  );
  assert.equal(
    resolveDealerSettlementDisplayStatus({ status: "取消", today }),
    "取消"
  );
});

test("販売店: 確定+過去支払予定日 → 期限超過", () => {
  assert.equal(
    resolveDealerSettlementDisplayStatus({
      status: "確定",
      scheduledPayoutDate: "2026-07-01",
      today,
    }),
    "期限超過"
  );
});

test("仕入先: 予定 / 支払済 / 期限超過 / 取消（信販と独立）", () => {
  assert.equal(
    resolveSupplierPaymentDisplayStatus({
      status: "予定",
      dueDate: "2026-08-31",
      today,
    }),
    "支払予定"
  );
  assert.equal(
    resolveSupplierPaymentDisplayStatus({
      status: "予定",
      dueDate: "2026-07-31",
      today,
    }),
    "期限超過"
  );
  assert.equal(
    resolveSupplierPaymentDisplayStatus({ status: "支払済", today }),
    "支払済"
  );
  assert.equal(
    resolveSupplierPaymentDisplayStatus({ status: "取消", today }),
    "取消"
  );
});

test("取消判定", () => {
  assert.equal(isCancelledMoneyEventStatus("取消"), true);
  assert.equal(isCancelledMoneyEventStatus("予定"), false);
});

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`\n${failed}/${tests.length} failed`);
  process.exit(1);
}
console.log(`\n${tests.length}/${tests.length} passed`);
