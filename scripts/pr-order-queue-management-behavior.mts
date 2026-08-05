/**
 * 発注管理キュー behavior テスト
 * Run: npx tsx scripts/pr-order-queue-management-behavior.mts
 */
import assert from "node:assert/strict";

import {
  buildOrderQueueRow,
  caseHasOrderableTargets,
  countActiveOrders,
  evaluateOrderQueueGate,
  isOrderQueueCandidate,
  resolveOrderQueueBlockReason,
  sortOrderQueueRows,
} from "../lib/queues/orderQueue.ts";
import { evaluateWorkflow } from "../lib/workflow/WorkflowEngine.ts";
import { buildWorkflowContext } from "../lib/workflow/buildContext.ts";

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

check("キャンセル案件が除外される", () => {
  assert.equal(
    isOrderQueueCandidate({
      caseStatus: "キャンセル",
      hasOrderableTargets: true,
      activeOrderCount: 0,
    }),
    false
  );
});

check("発注0件の案件が表示される", () => {
  assert.equal(
    isOrderQueueCandidate({
      caseStatus: "受付済",
      hasOrderableTargets: true,
      activeOrderCount: 0,
    }),
    true
  );
});

check("発注1件以上の案件が除外される", () => {
  assert.equal(
    isOrderQueueCandidate({
      caseStatus: "受付済",
      hasOrderableTargets: true,
      activeOrderCount: 1,
    }),
    false
  );
  assert.equal(countActiveOrders([{ status: "発注済" }, { status: "キャンセル" }]), 1);
});

check("請求済み・入金済みでも発注0件なら表示される", () => {
  assert.equal(
    isOrderQueueCandidate({
      caseStatus: "請求済",
      hasOrderableTargets: true,
      activeOrderCount: 0,
    }),
    true
  );
  assert.equal(
    isOrderQueueCandidate({
      caseStatus: "入金済",
      hasOrderableTargets: true,
      activeOrderCount: 0,
    }),
    true
  );
});

check("商品またはパッケージが無い案件は除外", () => {
  assert.equal(
    caseHasOrderableTargets({ caseProducts: [], casePackages: [] }),
    false
  );
  assert.equal(
    caseHasOrderableTargets({
      caseProducts: [{ line_type: "PRODUCT", product_id: "p1" }],
      casePackages: [],
    }),
    true
  );
  assert.equal(
    caseHasOrderableTargets({
      caseProducts: [{ line_type: "PACKAGE", product_id: null }],
      casePackages: [{ id: "pkg1" }],
    }),
    true
  );
});

check("工事日が近い順・未設定は最後", () => {
  const sorted = sortOrderQueueRows([
    {
      constructionDate: null,
      orderReceivedDate: "2026-01-01",
      caseNo: "C-3",
    },
    {
      constructionDate: "2026-08-10",
      orderReceivedDate: "2026-08-01",
      caseNo: "C-2",
    },
    {
      constructionDate: "2026-08-05",
      orderReceivedDate: "2026-08-02",
      caseNo: "C-1",
    },
    {
      constructionDate: "2026-08-05",
      orderReceivedDate: "2026-07-01",
      caseNo: "C-0",
    },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.caseNo),
    ["C-0", "C-1", "C-2", "C-3"]
  );
});

check("前金未入金は表示だが発注不可", () => {
  const gate = evaluateOrderQueueGate({
    settlement: { settlement_type: "前金", deposit_amount: 100000 },
    payments: [],
    orders: [],
  });
  assert.equal(gate.canOrder, false);
  assert.equal(gate.blockReason, "前金未入金");

  const row = buildOrderQueueRow(
    {
      id: "c1",
      case_no: "VE-1",
      status: "受付済",
      customer_name: "顧客",
      order_received_date: "2026-08-01",
      construction_desired_date: "2026-08-10",
      dealer_name: "販売店",
      settlement_type: "前金",
      has_orderable_targets: true,
      active_order_count: 0,
    },
    gate
  );
  assert.ok(row);
  assert.equal(row!.canOrder, false);
});

check("売掛は発注可能", () => {
  const gate = evaluateOrderQueueGate({
    settlement: { settlement_type: "売掛" },
    orders: [],
  });
  assert.equal(gate.canOrder, true);
  assert.equal(gate.blockReason, null);
});

check("カード未完了は発注不可", () => {
  const gate = evaluateOrderQueueGate({
    settlement: { settlement_type: "カード", card_status: "未決済" },
    orders: [],
  });
  assert.equal(gate.canOrder, false);
  assert.equal(gate.blockReason, "カード決済待ち");
});

check("3社間未承認は発注不可", () => {
  const gate = evaluateOrderQueueGate({
    settlement: { settlement_type: "3社間決済", loan_status: "申請中" },
    orders: [],
  });
  assert.equal(gate.canOrder, false);
  assert.equal(gate.blockReason, "審査承認待ち");
});

check("決済未設定は発注不可", () => {
  const gate = evaluateOrderQueueGate({
    settlement: null,
    orders: [],
  });
  assert.equal(gate.canOrder, false);
  assert.equal(gate.blockReason, "決済区分未設定");
});

check("発注成功後はキューから除外される判定", () => {
  assert.equal(
    isOrderQueueCandidate({
      caseStatus: "発注済",
      hasOrderableTargets: true,
      activeOrderCount: 1,
    }),
    false
  );
});

check("resolveOrderQueueBlockReason uses workflow", () => {
  const unset = evaluateWorkflow(
    buildWorkflowContext({
      settlement: null,
      orders: [],
    })
  );
  assert.equal(resolveOrderQueueBlockReason(unset), "決済区分未設定");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll order queue behavior checks passed");
