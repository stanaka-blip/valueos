/**
 * WorkflowEngine ユニットテスト
 *
 * 実行:
 *   npx tsx lib/workflow/WorkflowEngine.test.ts
 */
import assert from "node:assert/strict";

import { endOfMonth, endOfNextMonth } from "@/lib/workflow/dates";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import type { WorkflowContext, WorkflowResult } from "@/lib/workflow/types";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [];

function test(name: string, run: () => void) {
  tests.push({ name, run });
}

function ctx(partial: Partial<WorkflowContext>): WorkflowContext {
  return {
    settlementType: null,
    loanStatus: null,
    cardStatus: null,
    depositAmount: null,
    constructionCompletedDate: null,
    orders: [],
    invoices: [],
    payments: [],
    ...partial,
  };
}

function evaluate(partial: Partial<WorkflowContext>): WorkflowResult {
  return evaluateWorkflow(ctx(partial));
}

// ---------------------------------------------------------------------------
// 【前金】
// ---------------------------------------------------------------------------

test("前金: 請求前", () => {
  const r = evaluate({
    settlementType: "前金",
    depositAmount: 100000,
    invoices: [],
    payments: [],
  });
  assert.equal(r.ruleKey, "前金");
  assert.equal(r.canInvoice, true);
  assert.equal(r.canOrder, false);
  assert.equal(r.currentState, "入金確認待ち");
  assert.equal(r.assignee, "経理");
});

test("前金: 請求済、未入金", () => {
  const r = evaluate({
    settlementType: "前金",
    depositAmount: 100000,
    invoices: [
      { id: "i1", status: "請求済", invoiceAmount: 100000 },
    ],
    payments: [],
  });
  assert.equal(r.canInvoice, true);
  assert.equal(r.canOrder, false);
  assert.ok(
    r.warnings.some((w) => w.includes("入金確認前") || w.includes("入金"))
  );
});

test("前金: 一部入金", () => {
  const r = evaluate({
    settlementType: "前金",
    depositAmount: 100000,
    invoices: [
      { id: "i1", status: "請求済", invoiceAmount: 100000 },
    ],
    payments: [
      {
        id: "p1",
        invoiceId: "i1",
        status: "入金確認済",
        paymentAmount: 30000,
      },
    ],
  });
  assert.equal(r.canOrder, false);
  assert.equal(r.currentState, "入金確認待ち");
});

test("前金: 満額入金", () => {
  const r = evaluate({
    settlementType: "前金",
    depositAmount: 100000,
    invoices: [
      { id: "i1", status: "請求済", invoiceAmount: 100000 },
    ],
    payments: [
      {
        id: "p1",
        invoiceId: "i1",
        status: "入金確認済",
        paymentAmount: 100000,
      },
    ],
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.canInvoice, true);
  assert.equal(r.currentState, "発注可能");
  assert.equal(r.assignee, "発注担当");
});

test("前金: 請求額未設定時の入金あり", () => {
  const r = evaluate({
    settlementType: "前金",
    depositAmount: null,
    payments: [
      {
        id: "p1",
        invoiceId: "i1",
        status: "入金確認済",
        paymentAmount: 50000,
      },
    ],
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.assignee, "発注担当");
});

// ---------------------------------------------------------------------------
// 【ローン】
// ---------------------------------------------------------------------------

test("ローン: 未申請", () => {
  const r = evaluate({
    settlementType: "ローン",
    loanStatus: "未申請",
  });
  assert.equal(r.ruleKey, "ローン");
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
  assert.equal(r.currentState, "ローン承認待ち");
});

test("ローン: 審査中", () => {
  const r = evaluate({
    settlementType: "三社間決済",
    loanStatus: "申請中",
  });
  assert.equal(r.canOrder, false);
  assert.equal(r.currentState, "ローン承認待ち");
  assert.ok(r.warnings.some((w) => w.includes("ローン未承認")));
});

test("ローン: 承認済", () => {
  const r = evaluate({
    settlementType: "ローン",
    loanStatus: "承認済",
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.canInvoice, false);
  assert.equal(r.currentState, "完工報告待ち");
  assert.equal(r.assignee, "営業事務");
});

test("ローン: 否決", () => {
  const r = evaluate({
    settlementType: "ローン",
    loanStatus: "否認",
  });
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
  assert.equal(r.currentState, "ローン承認待ち");
});

test("ローン: 承認済だが完工日前", () => {
  const r = evaluate({
    settlementType: "ローン",
    loanStatus: "承認済",
    constructionCompletedDate: null,
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.canInvoice, false);
  assert.ok(r.warnings.some((w) => w.includes("完工日")));
});

test("ローン: 完工日登録後", () => {
  const r = evaluate({
    settlementType: "ローン",
    loanStatus: "承認済",
    constructionCompletedDate: "2026-07-20",
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.canInvoice, true);
  assert.equal(r.currentState, "請求可能");
  assert.equal(r.assignee, "経理");
});

// ---------------------------------------------------------------------------
// 【売掛】
// ---------------------------------------------------------------------------

test("売掛: 発注なし", () => {
  const r = evaluate({
    settlementType: "売掛",
    orders: [],
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.canInvoice, false);
  assert.ok(r.warnings.some((w) => w.includes("全発注が納品済")));
});

test("売掛: 発注あり、未納品", () => {
  const r = evaluate({
    settlementType: "掛売",
    orders: [
      { id: "o1", status: "発注済", deliveredDate: null },
    ],
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.canInvoice, false);
  assert.equal(r.currentState, "発注可能");
});

test("売掛: 一部納品", () => {
  const r = evaluate({
    settlementType: "売掛",
    orders: [
      { id: "o1", status: "納品済", deliveredDate: "2026-07-10" },
      { id: "o2", status: "発注済", deliveredDate: null },
    ],
  });
  assert.equal(r.canInvoice, false);
  assert.equal(r.billingClosingDate, null);
});

test("売掛: 全件納品済", () => {
  const r = evaluate({
    settlementType: "売掛",
    orders: [
      { id: "o1", status: "納品済", deliveredDate: "2026-07-10" },
      { id: "o2", status: "納品済", deliveredDate: "2026-07-25" },
    ],
  });
  assert.equal(r.canInvoice, true);
  assert.equal(r.currentState, "請求可能（全発注納品済）");
  assert.equal(r.billingClosingDate, "2026-07-31");
  assert.equal(r.paymentDueDate, "2026-08-31");
});

test("売掛: 月末日計算", () => {
  const r = evaluate({
    settlementType: "売掛",
    orders: [
      { id: "o1", status: "納品済", deliveredDate: "2026-06-15" },
    ],
  });
  assert.equal(r.billingClosingDate, "2026-06-30");
  assert.equal(r.paymentDueDate, "2026-07-31");
  assert.equal(endOfMonth("2026-06-15"), "2026-06-30");
  assert.equal(endOfNextMonth("2026-06-15"), "2026-07-31");
});

test("売掛: 2月（非うるう年）の翌月末計算", () => {
  const r = evaluate({
    settlementType: "売掛",
    orders: [
      { id: "o1", status: "納品済", deliveredDate: "2023-02-10" },
    ],
  });
  assert.equal(r.billingClosingDate, "2023-02-28");
  assert.equal(r.paymentDueDate, "2023-03-31");
  assert.equal(endOfMonth("2023-02-10"), "2023-02-28");
  assert.equal(endOfNextMonth("2023-02-10"), "2023-03-31");
});

test("売掛: うるう年2月の翌月末計算", () => {
  const r = evaluate({
    settlementType: "売掛",
    orders: [
      { id: "o1", status: "納品済", deliveredDate: "2024-02-15" },
    ],
  });
  assert.equal(r.billingClosingDate, "2024-02-29");
  assert.equal(r.paymentDueDate, "2024-03-31");
  assert.equal(endOfMonth("2024-01-31"), "2024-01-31");
  assert.equal(endOfNextMonth("2024-01-31"), "2024-02-29");
});

test("売掛: 納品済だが納品日NULLは請求不可", () => {
  const r = evaluate({
    settlementType: "売掛",
    orders: [
      { id: "o1", status: "納品済", deliveredDate: null },
    ],
  });
  assert.equal(r.canInvoice, false);
  assert.ok(r.warnings.includes("納品日が登録されていません"));
});

// ---------------------------------------------------------------------------
// 【カード】
// ---------------------------------------------------------------------------

test("カード: 未決済", () => {
  const r = evaluate({
    settlementType: "カード",
    cardStatus: "未決済",
  });
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
  assert.equal(r.currentState, "カード決済待ち");
});

test("カード: 決済中", () => {
  const r = evaluate({
    settlementType: "カード",
    cardStatus: "処理中",
  });
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
  assert.equal(r.currentState, "カード決済待ち");
});

test("カード: 決済成功", () => {
  const r = evaluate({
    settlementType: "カード",
    cardStatus: "決済成功",
  });
  assert.equal(r.canOrder, true);
  assert.equal(r.canInvoice, true);
  assert.equal(r.currentState, "発注・請求可能");
  assert.equal(r.assignee, "発注担当");
});

test("カード: 失敗", () => {
  const r = evaluate({
    settlementType: "カード",
    cardStatus: "決済失敗",
  });
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
});

test("カード: 取消", () => {
  const r = evaluate({
    settlementType: "カード",
    cardStatus: "取消",
  });
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
});

// ---------------------------------------------------------------------------
// 【データ異常】（業務判定上の扱い。errors/dataIssues は持たない）
// ---------------------------------------------------------------------------

test("データ異常: 決済区分NULL", () => {
  const r = evaluate({
    settlementType: null,
  });
  assert.equal(r.ruleKey, null);
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
  assert.equal(r.currentState, "決済条件未設定");
  assert.ok(r.warnings.includes("決済区分が未設定です"));
});

test("データ異常: その他", () => {
  const r = evaluate({
    settlementType: "その他",
  });
  assert.equal(r.ruleKey, null);
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
  assert.ok(r.warnings.some((w) => w.includes("未対応の決済区分")));
});

test("データ異常: 未知の決済区分", () => {
  const r = evaluate({
    settlementType: "現金",
  });
  assert.equal(r.ruleKey, null);
  assert.equal(r.canOrder, false);
  assert.equal(r.canInvoice, false);
  assert.ok(r.warnings.includes("未対応の決済区分です: 現金"));
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const t of tests) {
  try {
    t.run();
    passed += 1;
    console.log(`ok  - ${t.name}`);
  } catch (err) {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${t.name}: ${message}`);
    console.log(`NG  - ${t.name}`);
    console.log(`     ${message}`);
  }
}

console.log("");
console.log(`total=${tests.length} passed=${passed} failed=${failed}`);

if (failed > 0) {
  console.log("");
  console.log("failures:");
  for (const f of failures) {
    console.log(`- ${f}`);
  }
  process.exit(1);
}
