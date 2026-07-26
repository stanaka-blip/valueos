/**
 * 入金状態判定ユニットテスト
 *
 * 実行: npx tsx lib/payments/invoicePaymentStatus.test.ts
 */
import assert from "node:assert/strict";

import {
  calcDelayDays,
  isPaymentOverdue,
  summarizeInvoicePayments,
  sumConfirmedPaidAmount,
} from "@/lib/payments/invoicePaymentStatus";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("未入金", () => {
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "未入金");
  assert.equal(r.confirmedPaidAmount, 0);
  assert.equal(r.unpaidAmount, 100000);
});

test("一部入金", () => {
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ paymentAmount: 40000, status: "入金確認済" }],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "一部入金");
  assert.equal(r.unpaidAmount, 60000);
});

test("満額入金", () => {
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ paymentAmount: 100000, status: "入金確認済" }],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "入金済");
  assert.equal(r.unpaidAmount, 0);
});

test("複数回入金", () => {
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [
      { paymentAmount: 30000, status: "入金確認済" },
      { paymentAmount: 70000, status: "入金確認済" },
    ],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "入金済");
  assert.equal(r.confirmedPaidAmount, 100000);
});

test("過入金", () => {
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ paymentAmount: 120000, status: "入金確認済" }],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "入金済");
  assert.equal(r.overpaidAmount, 20000);
  assert.ok(r.warnings.some((w) => w.includes("過入金")));
});

test("確認待ちは集計されない", () => {
  const paid = sumConfirmedPaidAmount([
    { paymentAmount: 50000, status: "確認待ち" },
    { paymentAmount: 50000, status: "入金確認中" },
  ]);
  assert.equal(paid, 0);
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ paymentAmount: 100000, status: "確認待ち" }],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "未入金");
});

test("取消は集計されない", () => {
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [
      { paymentAmount: 100000, status: "取消" },
      { paymentAmount: 40000, status: "入金確認済" },
    ],
    today: "2026-07-26",
  });
  assert.equal(r.confirmedPaidAmount, 40000);
  assert.equal(r.displayStatus, "一部入金");
});

test("期限超過", () => {
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-07-20",
    payments: [],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "期限超過");
  assert.equal(r.isOverdue, true);
  assert.equal(r.delayDays, 6);
});

test("期限当日は遅延扱いしない", () => {
  assert.equal(
    isPaymentOverdue({
      dueDate: "2026-07-26",
      unpaidAmount: 100000,
      today: "2026-07-26",
    }),
    false
  );
  assert.equal(
    calcDelayDays({
      dueDate: "2026-07-26",
      unpaidAmount: 100000,
      today: "2026-07-26",
    }),
    0
  );
  const r = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-07-26",
    payments: [],
    today: "2026-07-26",
  });
  assert.equal(r.displayStatus, "未入金");
});

test("異なる請求への入金が混ざらない", () => {
  // 関数は渡された payments のみを見る（呼び出し側で invoice_id 絞り込み）
  const invoiceA = summarizeInvoicePayments({
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ paymentAmount: 100000, status: "入金確認済" }],
    today: "2026-07-26",
  });
  const invoiceB = summarizeInvoicePayments({
    invoiceAmount: 200000,
    dueDate: "2026-08-31",
    payments: [{ paymentAmount: 50000, status: "入金確認済" }],
    today: "2026-07-26",
  });
  assert.equal(invoiceA.displayStatus, "入金済");
  assert.equal(invoiceB.displayStatus, "一部入金");
  assert.equal(invoiceB.confirmedPaidAmount, 50000);
});

test("前金満額入金後に発注可能（WorkflowEngine経由）", async () => {
  const { evaluateWorkflow } = await import("@/lib/workflow/WorkflowEngine");
  const { buildWorkflowContext } = await import("@/lib/workflow/buildContext");
  const before = evaluateWorkflow(
    buildWorkflowContext({
      settlement: { settlement_type: "前金", deposit_amount: 100000 },
      orders: [],
      invoices: [{ id: "i1", status: "請求済", invoice_amount: 100000 }],
      payments: [],
    })
  );
  assert.equal(before.canOrder, false);

  const after = evaluateWorkflow(
    buildWorkflowContext({
      settlement: { settlement_type: "前金", deposit_amount: 100000 },
      orders: [],
      invoices: [{ id: "i1", status: "請求済", invoice_amount: 100000 }],
      payments: [
        {
          id: "p1",
          invoice_id: "i1",
          status: "入金確認済",
          payment_amount: 100000,
        },
      ],
    })
  );
  assert.equal(after.canOrder, true);
});

async function main() {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await Promise.resolve(t.run());
      passed++;
      console.log(`ok  - ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`NG  - ${t.name}`);
      console.log(`     ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`total=${tests.length} passed=${passed} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main();
