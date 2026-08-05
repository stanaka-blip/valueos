/**
 * 納品管理キュー behavior テスト
 * Run: npx tsx scripts/pr-delivery-queue-management-behavior.mts
 */
import assert from "node:assert/strict";

import {
  buildDeliveryQueueRow,
  countDeliveredOrders,
  isDeliveryQueueCandidate,
  isOrderDelivered,
  pickConfirmOrder,
  resolveCaseExpectedDeliveryDate,
  resolveDeliveryStateLabel,
  sortDeliveryQueueRows,
} from "../lib/queues/deliveryQueue.ts";

let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("OK", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, e);
  }
}

check("キャンセル除外", () => {
  assert.equal(
    isDeliveryQueueCandidate({
      caseStatus: "キャンセル",
      activeOrderCount: 1,
      deliveredCount: 0,
    }),
    false
  );
});

check("発注なし除外", () => {
  assert.equal(
    isDeliveryQueueCandidate({
      caseStatus: "発注済",
      activeOrderCount: 0,
      deliveredCount: 0,
    }),
    false
  );
});

check("全納品済除外", () => {
  assert.equal(
    isDeliveryQueueCandidate({
      caseStatus: "発注済",
      activeOrderCount: 2,
      deliveredCount: 2,
    }),
    false
  );
  assert.equal(
    isOrderDelivered({ status: "納品済", delivered_date: null }),
    true
  );
  assert.equal(
    isOrderDelivered({ status: "発注済", delivered_date: "2026-08-01" }),
    true
  );
  assert.equal(countDeliveredOrders([{ status: "納品済" }, { status: "キャンセル" }]), 1);
});

check("未納品表示", () => {
  assert.equal(
    isDeliveryQueueCandidate({
      caseStatus: "発注済",
      activeOrderCount: 2,
      deliveredCount: 0,
    }),
    true
  );
  assert.equal(
    isDeliveryQueueCandidate({
      caseStatus: "発注済",
      activeOrderCount: 2,
      deliveredCount: 1,
    }),
    true
  );
  assert.equal(resolveDeliveryStateLabel(2, 0), "未納品");
  assert.equal(resolveDeliveryStateLabel(2, 1), "一部納品");
  assert.equal(resolveDeliveryStateLabel(2, 2), "全納品済");
});

check("納品予定日順・工事日順・案件番号順", () => {
  const sorted = sortDeliveryQueueRows([
    {
      expectedDeliveryDate: null,
      constructionDate: "2026-08-01",
      caseNo: "C-9",
    },
    {
      expectedDeliveryDate: "2026-08-20",
      constructionDate: "2026-08-01",
      caseNo: "C-2",
    },
    {
      expectedDeliveryDate: "2026-08-10",
      constructionDate: "2026-08-15",
      caseNo: "C-1",
    },
    {
      expectedDeliveryDate: "2026-08-10",
      constructionDate: "2026-08-05",
      caseNo: "C-0",
    },
    {
      expectedDeliveryDate: "2026-08-10",
      constructionDate: "2026-08-05",
      caseNo: "C-1b",
    },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.caseNo),
    ["C-0", "C-1b", "C-1", "C-2", "C-9"]
  );
});

check("納品確認導線", () => {
  const row = buildDeliveryQueueRow({
    id: "case-1",
    case_no: "VE-1",
    status: "発注済",
    customer_name: "顧客",
    construction_desired_date: "2026-08-20",
    dealer_name: "販売店",
    orders: [
      {
        id: "ord-late",
        status: "発注済",
        expected_delivery_date: "2026-08-20",
        delivered_date: null,
      },
      {
        id: "ord-soon",
        status: "発注済",
        expected_delivery_date: "2026-08-05",
        delivered_date: null,
      },
      {
        id: "ord-done",
        status: "納品済",
        expected_delivery_date: "2026-08-01",
        delivered_date: "2026-08-01",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.confirmHref, "/orders/ord-soon/edit");
  assert.equal(row!.detailHref, "/cases/case-1");
  assert.equal(row!.orderCount, 3);
  assert.equal(row!.deliveredCount, 1);
  assert.equal(row!.stateLabel, "一部納品");
  assert.equal(row!.expectedDeliveryDate, "2026-08-05");
  assert.equal(
    pickConfirmOrder([
      { id: "a", status: "発注済", expected_delivery_date: "2026-09-01" },
      { id: "b", status: "発注済", expected_delivery_date: "2026-08-01" },
    ])?.id,
    "b"
  );
});

check("全納品後に除外判定", () => {
  const row = buildDeliveryQueueRow({
    id: "case-2",
    case_no: "VE-2",
    status: "納品済",
    customer_name: "顧客",
    construction_desired_date: "2026-08-20",
    dealer_name: "販売店",
    orders: [
      {
        id: "o1",
        status: "納品済",
        expected_delivery_date: "2026-08-05",
        delivered_date: "2026-08-05",
      },
    ],
  });
  assert.equal(row, null);
  assert.equal(
    resolveCaseExpectedDeliveryDate([
      { id: "o1", status: "納品済", expected_delivery_date: "2026-08-05" },
    ]),
    null
  );
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll delivery queue behavior checks passed");
