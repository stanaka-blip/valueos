/**
 * 回収管理キュー behavior テスト
 * Run: npx tsx scripts/pr-collection-queue-management-behavior.mts
 */
import assert from "node:assert/strict";

import {
  buildCollectionQueueRow,
  isAdvancePaymentComplete,
  isCardSettlementComplete,
  isLoanApprovalComplete,
  sortCollectionQueueRows,
} from "../lib/queues/collectionQueue.ts";

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

const base = {
  id: "c1",
  case_no: "VE-1",
  status: "受付済",
  customer_name: "顧客",
  order_received_date: "2026-07-01",
  dealer_name: "販売店",
  deposit_amount: null as number | null,
  loan_status: null as string | null,
  card_status: null as string | null,
  approval_number: null as string | null,
  orders: [] as {
    id: string;
    status?: string | null;
    delivered_date?: string | null;
  }[],
  invoices: [] as {
    id: string;
    status?: string | null;
    invoice_amount?: number | null;
    due_date?: string | null;
  }[],
  payments: [] as {
    id: string;
    status?: string | null;
    payment_amount?: number | null;
    invoice_id?: string | null;
  }[],
  today: "2026-08-05",
};

check("キャンセル案件を除外", () => {
  const row = buildCollectionQueueRow({
    ...base,
    status: "キャンセル",
    settlement_type: "前金",
    deposit_amount: 100000,
  });
  assert.equal(row, null);
});

check("案件ステータスだけで除外しない", () => {
  const row = buildCollectionQueueRow({
    ...base,
    status: "請求済",
    settlement_type: "前金",
    deposit_amount: 100000,
  });
  assert.ok(row);
  assert.equal(row!.stateLabel, "請求待ち");
});

check("前金: 請求なしを表示", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "前金",
    deposit_amount: 100000,
  });
  assert.ok(row);
  assert.equal(row!.stateLabel, "請求待ち");
  assert.equal(row!.nextAction, "請求書を作成");
  assert.equal(row!.secondaryHref, "/cases/c1/invoices/new");
  assert.equal(row!.amount, 100000);
});

check("前金: 未入金を表示", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "前金",
    deposit_amount: 100000,
    invoices: [{ id: "i1", status: "請求済", invoice_amount: 100000 }],
  });
  assert.ok(row);
  assert.equal(row!.stateLabel, "未入金");
  assert.equal(row!.nextAction, "入金確認");
});

check("前金: 一部入金を表示", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "前金",
    deposit_amount: 100000,
    invoices: [{ id: "i1", status: "請求済", invoice_amount: 100000 }],
    payments: [
      { id: "p1", status: "入金確認済", payment_amount: 30000, invoice_id: "i1" },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stateLabel, "一部入金");
  assert.equal(row!.nextAction, "残額確認");
});

check("前金: 全額入金済みを除外", () => {
  assert.equal(
    isAdvancePaymentComplete({
      depositAmount: 100000,
      payments: [
        { id: "p1", status: "入金確認済", payment_amount: 100000 },
      ],
    }),
    true
  );
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "前金",
    deposit_amount: 100000,
    invoices: [{ id: "i1", status: "請求済", invoice_amount: 100000 }],
    payments: [
      { id: "p1", status: "入金確認済", payment_amount: 100000, invoice_id: "i1" },
    ],
  });
  assert.equal(row, null);
});

check("売掛: 未納品案件を除外", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [{ id: "o1", status: "発注済", delivered_date: null }],
  });
  assert.equal(row, null);
});

check("売掛: 全納品済み・未請求を表示", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [
      { id: "o1", status: "納品済", delivered_date: "2026-07-10" },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stateLabel, "請求待ち");
  assert.equal(row!.nextAction, "請求書を作成");
  assert.equal(row!.dueDate, "2026-08-31");
});

check("売掛: 請求済み・未入金を表示", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [
      { id: "o1", status: "納品済", delivered_date: "2026-07-10" },
    ],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 200000,
        due_date: "2026-08-31",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stateLabel, "入金待ち");
  assert.equal(row!.amount, 200000);
});

check("売掛: 一部入金を表示", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [
      { id: "o1", status: "納品済", delivered_date: "2026-07-10" },
    ],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 200000,
        due_date: "2026-08-31",
      },
    ],
    payments: [
      { id: "p1", status: "入金確認済", payment_amount: 50000, invoice_id: "i1" },
    ],
  });
  assert.ok(row);
  assert.equal(row!.stateLabel, "一部入金");
});

check("売掛: 全額入金済みを除外", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [
      { id: "o1", status: "納品済", delivered_date: "2026-07-10" },
    ],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 200000,
        due_date: "2026-08-31",
      },
    ],
    payments: [
      {
        id: "p1",
        status: "入金確認済",
        payment_amount: 200000,
        invoice_id: "i1",
      },
    ],
  });
  assert.equal(row, null);
});

check("売掛: 期限超過を優先表示", () => {
  const overdue = buildCollectionQueueRow({
    ...base,
    id: "over",
    case_no: "VE-OVER",
    settlement_type: "売掛",
    order_received_date: "2026-08-01",
    orders: [
      { id: "o1", status: "納品済", delivered_date: "2026-05-10" },
    ],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 100000,
        due_date: "2026-06-30",
      },
    ],
  });
  assert.ok(overdue);
  assert.equal(overdue!.stateLabel, "期限超過");
  assert.equal(overdue!.isOverdue, true);
  assert.equal(overdue!.nextAction, "催促");

  const waiting = buildCollectionQueueRow({
    ...base,
    id: "wait",
    case_no: "VE-WAIT",
    settlement_type: "売掛",
    order_received_date: "2026-01-01",
    orders: [
      { id: "o1", status: "納品済", delivered_date: "2026-07-10" },
    ],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 100000,
        due_date: "2026-08-31",
      },
    ],
  });
  assert.ok(waiting);

  const sorted = sortCollectionQueueRows([waiting!, overdue!]);
  assert.equal(sorted[0].caseNo, "VE-OVER");
});

check("カード: 未決済を表示 / 決済完了を除外", () => {
  const pending = buildCollectionQueueRow({
    ...base,
    settlement_type: "カード",
    card_status: "未決済",
  });
  assert.ok(pending);
  assert.equal(pending!.stateLabel, "カード決済待ち");
  assert.equal(pending!.nextAction, "決済処理・承認確認");

  assert.equal(isCardSettlementComplete("決済成功"), true);
  const done = buildCollectionQueueRow({
    ...base,
    settlement_type: "カード",
    card_status: "決済成功",
  });
  assert.equal(done, null);
});

check("3社間: 未承認 / 承認番号なし / 完了除外", () => {
  const pending = buildCollectionQueueRow({
    ...base,
    settlement_type: "3社間決済",
    loan_status: "申請中",
    approval_number: null,
  });
  assert.ok(pending);
  assert.equal(pending!.stateLabel, "審査承認待ち");

  const noNumber = buildCollectionQueueRow({
    ...base,
    settlement_type: "3社間決済",
    loan_status: "承認済",
    approval_number: "",
  });
  assert.ok(noNumber);
  assert.equal(noNumber!.nextAction, "承認番号確認");

  assert.equal(
    isLoanApprovalComplete({
      loanStatus: "承認済",
      approvalNumber: "AP-1",
    }),
    true
  );
  const done = buildCollectionQueueRow({
    ...base,
    settlement_type: "3社間決済",
    loan_status: "承認済",
    approval_number: "AP-1",
  });
  assert.equal(done, null);
});

check("並び: 期限超過最上位・期限昇順・期限なし後・受付日・案件番号", () => {
  const sorted = sortCollectionQueueRows([
    {
      isOverdue: false,
      dueDate: null,
      orderReceivedDate: "2026-01-01",
      caseNo: "C-9",
    },
    {
      isOverdue: false,
      dueDate: "2026-08-20",
      orderReceivedDate: "2026-02-01",
      caseNo: "C-2",
    },
    {
      isOverdue: false,
      dueDate: "2026-08-10",
      orderReceivedDate: "2026-03-01",
      caseNo: "C-1",
    },
    {
      isOverdue: true,
      dueDate: "2026-07-01",
      orderReceivedDate: "2026-06-01",
      caseNo: "C-0",
    },
    {
      isOverdue: false,
      dueDate: "2026-08-10",
      orderReceivedDate: "2026-03-01",
      caseNo: "C-1b",
    },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.caseNo),
    ["C-0", "C-1", "C-1b", "C-2", "C-9"]
  );
});

check("案件詳細への導線", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "カード",
    card_status: "処理中",
  });
  assert.ok(row);
  assert.equal(row!.detailHref, "/cases/c1");
});

check("回収完了案件を除外（決済未設定も対象外）", () => {
  assert.equal(
    buildCollectionQueueRow({
      ...base,
      settlement_type: null,
    }),
    null
  );
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll collection queue behavior checks passed");
