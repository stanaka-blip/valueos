/**
 * 回収管理キュー behavior テスト
 * Run: npx tsx scripts/pr-collection-queue-management-behavior.mts
 */
import assert from "node:assert/strict";

import {
  buildCollectionQueueRow,
  buildCollectionQueueSummary,
  isAdvancePaymentComplete,
  isCardSettlementComplete,
  isLoanApprovalComplete,
  resolveCollectionUiCategory,
  sortCollectionQueueRows,
  unpaidActiveInvoicesForCollection,
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
  assert.equal(row!.secondaryHref, "/invoices/i1/payments/new");
  assert.equal(row!.secondaryLabel, "入金登録");
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
  assert.equal(row!.secondaryHref, "/invoices/i1/payments/new");
  assert.equal(row!.secondaryLabel, "入金登録");
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
  assert.equal(row!.secondaryHref, "/invoices/i1/payments/new");
  assert.equal(row!.secondaryLabel, "入金登録");
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
  assert.equal(row!.secondaryHref, "/invoices/i1/payments/new");
  assert.equal(row!.secondaryLabel, "入金登録");
});

check("未収請求1件 → 入金登録へ直接", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-07-10" }],
    invoices: [
      {
        id: "inv-only",
        status: "請求済",
        invoice_amount: 100000,
        due_date: "2026-08-31",
      },
      {
        id: "inv-paid",
        status: "請求済",
        invoice_amount: 50000,
        due_date: "2026-08-31",
      },
      {
        id: "inv-cancel",
        status: "取消",
        invoice_amount: 99999,
        due_date: "2026-08-31",
      },
    ],
    payments: [
      {
        id: "p-paid",
        status: "入金確認済",
        payment_amount: 50000,
        invoice_id: "inv-paid",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.secondaryHref, "/invoices/inv-only/payments/new");
  assert.equal(row!.secondaryLabel, "入金登録");
});

check("未収請求複数 → 請求・入金タブ", () => {
  const row = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-07-10" }],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 100000,
        due_date: "2026-08-31",
      },
      {
        id: "i2",
        status: "請求済",
        invoice_amount: 80000,
        due_date: "2026-09-30",
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.secondaryHref, "/cases/c1?tab=invoice");
  assert.equal(row!.secondaryLabel, "請求・入金");
});

check("取消・入金済は未収に数えない / 一部入金は未収", () => {
  const unpaid = unpaidActiveInvoicesForCollection(
    [
      { id: "a", status: "取消", invoice_amount: 1000 },
      { id: "b", status: "請求済", invoice_amount: 100000 },
      { id: "c", status: "請求済", invoice_amount: 50000 },
      { id: "d", status: "請求済", invoice_amount: 20000 },
    ],
    [
      {
        id: "p1",
        status: "入金確認済",
        payment_amount: 100000,
        invoice_id: "b",
      },
      {
        id: "p2",
        status: "入金確認済",
        payment_amount: 10000,
        invoice_id: "c",
      },
    ]
  );
  assert.deepEqual(
    unpaid.map((i) => i.id),
    ["c", "d"]
  );
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

check("UI分類: 請求待ち/入金待ち/一部入金/期限超過/カード/3社間", () => {
  assert.equal(resolveCollectionUiCategory("請求待ち"), "invoice_pending");
  assert.equal(resolveCollectionUiCategory("未入金"), "payment_waiting");
  assert.equal(resolveCollectionUiCategory("入金待ち"), "payment_waiting");
  assert.equal(resolveCollectionUiCategory("一部入金"), "partial_payment");
  assert.equal(resolveCollectionUiCategory("期限超過"), "overdue");
  assert.equal(
    resolveCollectionUiCategory("カード決済待ち"),
    "settlement_review"
  );
  assert.equal(
    resolveCollectionUiCategory("審査承認待ち"),
    "settlement_review"
  );

  const invoicePending = buildCollectionQueueRow({
    ...base,
    settlement_type: "前金",
    deposit_amount: 100000,
  });
  assert.equal(invoicePending?.uiCategory, "invoice_pending");
  assert.equal(invoicePending?.ctaLabel, "請求書を作成");

  const waiting = buildCollectionQueueRow({
    ...base,
    settlement_type: "前金",
    deposit_amount: 100000,
    invoices: [{ id: "i1", status: "請求済", invoice_amount: 100000 }],
  });
  assert.equal(waiting?.uiCategory, "payment_waiting");
  assert.equal(waiting?.displayStateLabel, "入金待ち");
  assert.equal(waiting?.ctaLabel, "入金登録");
  assert.equal(waiting?.invoiceAmount, 100000);
  assert.equal(waiting?.confirmedPaidAmount, 0);
  assert.equal(waiting?.remainingAmount, 100000);

  const partial = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-07-10" }],
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
  assert.equal(partial?.uiCategory, "partial_payment");
  assert.equal(partial?.ctaLabel, "追加入金");
  assert.equal(partial?.remainingAmount, 150000);

  const overdue = buildCollectionQueueRow({
    ...base,
    settlement_type: "売掛",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-05-10" }],
    invoices: [
      {
        id: "i1",
        status: "請求済",
        invoice_amount: 100000,
        due_date: "2026-06-30",
      },
    ],
  });
  assert.equal(overdue?.uiCategory, "overdue");
  assert.equal(overdue?.ctaLabel, "入金登録");

  const card = buildCollectionQueueRow({
    ...base,
    settlement_type: "カード",
    card_status: "未決済",
  });
  assert.equal(card?.uiCategory, "settlement_review");
  assert.equal(card?.invoiceAmount, null);
  assert.equal(card?.ctaLabel, "案件詳細");

  const loan = buildCollectionQueueRow({
    ...base,
    settlement_type: "3社間決済",
    loan_status: "申請中",
  });
  assert.equal(loan?.uiCategory, "settlement_review");
  assert.equal(loan?.remainingAmount, null);
});

check("サマリー件数と残額集計", () => {
  const rows = [
    buildCollectionQueueRow({
      ...base,
      id: "a",
      case_no: "A",
      settlement_type: "前金",
      deposit_amount: 100000,
    })!,
    buildCollectionQueueRow({
      ...base,
      id: "b",
      case_no: "B",
      settlement_type: "売掛",
      orders: [{ id: "o1", status: "納品済", delivered_date: "2026-07-10" }],
      invoices: [
        {
          id: "i1",
          status: "請求済",
          invoice_amount: 200000,
          due_date: "2026-08-31",
        },
      ],
    })!,
    buildCollectionQueueRow({
      ...base,
      id: "c",
      case_no: "C",
      settlement_type: "売掛",
      orders: [{ id: "o1", status: "納品済", delivered_date: "2026-07-10" }],
      invoices: [
        {
          id: "i1",
          status: "請求済",
          invoice_amount: 100000,
          due_date: "2026-08-31",
        },
      ],
      payments: [
        {
          id: "p1",
          status: "入金確認済",
          payment_amount: 40000,
          invoice_id: "i1",
        },
      ],
    })!,
    buildCollectionQueueRow({
      ...base,
      id: "d",
      case_no: "D",
      settlement_type: "売掛",
      orders: [{ id: "o1", status: "納品済", delivered_date: "2026-05-10" }],
      invoices: [
        {
          id: "i1",
          status: "請求済",
          invoice_amount: 80000,
          due_date: "2026-06-30",
        },
      ],
    })!,
    buildCollectionQueueRow({
      ...base,
      id: "e",
      case_no: "E",
      settlement_type: "カード",
      card_status: "未決済",
    })!,
  ];

  const summary = buildCollectionQueueSummary(rows);
  assert.equal(summary.invoicePendingCount, 1);
  assert.equal(summary.paymentWaitingCount, 1);
  assert.equal(summary.paymentWaitingRemaining, 200000);
  assert.equal(summary.partialPaymentCount, 1);
  assert.equal(summary.partialPaymentRemaining, 60000);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.overdueRemaining, 80000);
  assert.equal(summary.settlementReviewCount, 1);
});

check("並び: UIカテゴリ優先（期限超過→請求待ち→一部入金→入金待ち→決済審査）", () => {
  const sorted = sortCollectionQueueRows([
    {
      isOverdue: false,
      dueDate: null,
      orderReceivedDate: "2026-01-01",
      caseNo: "settle",
      uiCategory: "settlement_review" as const,
    },
    {
      isOverdue: false,
      dueDate: "2026-08-20",
      orderReceivedDate: "2026-01-01",
      caseNo: "wait",
      uiCategory: "payment_waiting" as const,
    },
    {
      isOverdue: false,
      dueDate: "2026-08-10",
      orderReceivedDate: "2026-01-01",
      caseNo: "partial",
      uiCategory: "partial_payment" as const,
    },
    {
      isOverdue: false,
      dueDate: "2026-08-05",
      orderReceivedDate: "2026-01-01",
      caseNo: "invoice",
      uiCategory: "invoice_pending" as const,
    },
    {
      isOverdue: true,
      dueDate: "2026-07-01",
      orderReceivedDate: "2026-01-01",
      caseNo: "over",
      uiCategory: "overdue" as const,
    },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.caseNo),
    ["over", "invoice", "partial", "wait", "settle"]
  );
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll collection queue behavior checks passed");
