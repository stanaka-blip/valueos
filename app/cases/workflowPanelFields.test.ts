/**
 * 業務ワークフロー入力欄の表示・保存payloadテスト
 *
 * 実行:
 *   npx tsx --test app/cases/workflowPanelFields.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildSettlementSavePatch } from "@/lib/caseSettlements/settlementSaveLogic";
import { CARD_STATUSES, LOAN_STATUSES } from "@/lib/workflow";

import {
  buildWorkflowPanelMetaPayload,
  buildWorkflowPanelSaveBody,
  formatWorkflowPanelDate,
  resolveLatestConfirmedPaymentDate,
  resolveLatestOrderDeliveryDate,
  resolveWorkflowPanelFieldVisibility,
  workflowPanelInputGridClass,
} from "./[id]/workflowPanelFields";

const settlement = {
  id: "s1",
  settlementType: "カード",
  feeRate: null,
  feeAmount: 0,
  depositRate: null,
  depositAmount: null,
  paymentTerms: "",
  cardBrand: "VISA",
  financeCompany: "",
  approvalNumber: "",
  memo: "",
  loanStatus: "承認済",
  cardStatus: "処理中",
  constructionCompletedDateFromMeta: "",
};

test("前金は入金日のみ表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("前金");
  assert.equal(v.showPaymentDate, true);
  assert.equal(v.showDeliveryDate, false);
  assert.equal(v.showCompletionDate, false);
  assert.equal(v.showLoanStatus, false);
  assert.equal(v.showCardStatus, false);
});

test("売掛は納品日のみ表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("売掛");
  assert.equal(v.showDeliveryDate, true);
  assert.equal(v.showPaymentDate, false);
  assert.equal(v.showCompletionDate, false);
  assert.equal(v.showLoanStatus, false);
  assert.equal(v.showCardStatus, false);
});

test("カードはカードステータスのみ", () => {
  const v = resolveWorkflowPanelFieldVisibility("カード");
  assert.equal(v.showCardStatus, true);
  assert.equal(v.showCompletionDate, false);
  assert.equal(v.showLoanStatus, false);
  assert.equal(v.showPaymentDate, false);
  assert.equal(v.showDeliveryDate, false);
});

test("カードではローンステータス非表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("カード");
  assert.equal(v.showLoanStatus, false);
});

test("3社間はローンステータス＋完工日", () => {
  const v = resolveWorkflowPanelFieldVisibility("3社間決済");
  assert.equal(v.showLoanStatus, true);
  assert.equal(v.showCompletionDate, true);
  assert.equal(v.showCardStatus, false);
  assert.equal(v.showPaymentDate, false);
  assert.equal(v.showDeliveryDate, false);
});

test("3社間ではカードステータス非表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("3社間決済");
  assert.equal(v.showCardStatus, false);
});

test("未設定は完工日のみ", () => {
  const v = resolveWorkflowPanelFieldVisibility("");
  assert.equal(v.showCompletionDate, true);
  assert.equal(v.showPaymentDate, false);
  assert.equal(v.showDeliveryDate, false);
});

test("確認済入金日は入金確認済の最終入金日", () => {
  assert.equal(
    resolveLatestConfirmedPaymentDate([
      { paymentDate: "2026-07-01", status: "確認待ち" },
      { paymentDate: "2026-07-10", status: "入金確認済" },
      { paymentDate: "2026-07-20", status: "入金確認済" },
      { paymentDate: "2026-07-15", status: "取消" },
    ]),
    "2026-07-20"
  );
});

test("納品日は有効発注の最終納品日", () => {
  assert.equal(
    resolveLatestOrderDeliveryDate([
      { deliveredDate: "2026-07-01", status: "納品済" },
      { deliveredDate: "2026-07-20", status: "納品済" },
      { deliveredDate: "2026-07-25", status: "取消" },
      { deliveredDate: null, status: "納期確定" },
    ]),
    "2026-07-20"
  );
});

test("非表示フィールドを保存payloadへ含めない", () => {
  const cardBody = buildWorkflowPanelSaveBody({
    settlement: { ...settlement, settlementType: "カード" },
    visibility: resolveWorkflowPanelFieldVisibility("カード"),
    loanStatus: "未申請",
    cardStatus: "決済成功",
    now: "2026-08-05T00:00:00.000Z",
  });
  assert.equal(cardBody.loan_status, undefined);
  assert.equal(cardBody.card_status, "決済成功");

  const zenkinBody = buildWorkflowPanelSaveBody({
    settlement: { ...settlement, settlementType: "前金" },
    visibility: resolveWorkflowPanelFieldVisibility("前金"),
    loanStatus: "未申請",
    cardStatus: "未決済",
    now: "2026-08-05T00:00:00.000Z",
  });
  assert.equal(zenkinBody.loan_status, undefined);
  assert.equal(zenkinBody.card_status, undefined);
});

test("非表示フィールドの既存値をnullで上書きしない", () => {
  const existing = {
    id: "s1",
    created_at: "",
    updated_at: "",
    case_id: "c1",
    settlement_type: "カード",
    fee_rate: null,
    fee_amount: 0,
    deposit_rate: null,
    deposit_amount: null,
    payment_terms: null,
    card_brand: "VISA",
    finance_company: null,
    approval_number: null,
    memo: null,
    loan_status: "承認済",
    loan_status_updated_at: "2026-01-01T00:00:00.000Z",
    card_status: "処理中",
    card_status_updated_at: "2026-01-02T00:00:00.000Z",
  };

  const cardOnly = buildSettlementSavePatch(
    {
      source: "workflow_panel",
      card_status: "決済成功",
      card_status_updated_at: "2026-08-05T00:00:00.000Z",
    },
    existing
  );
  assert.equal(cardOnly.ok, true);
  if (cardOnly.ok) {
    assert.equal(cardOnly.patch.loan_status, "承認済");
    assert.equal(cardOnly.patch.card_status, "決済成功");
  }
});

test("memoフォールバックでも非表示項目の既存値を維持", () => {
  const meta = buildWorkflowPanelMetaPayload({
    settlement: { ...settlement, settlementType: "カード" },
    visibility: resolveWorkflowPanelFieldVisibility("カード"),
    loanStatus: "未申請",
    cardStatus: "決済成功",
    completedDate: "2026-08-05",
    existingConstructionCompletedDate: "2026-07-01",
  });
  assert.equal(meta.loan_status, "承認済");
  assert.equal(meta.card_status, "決済成功");
  assert.equal(meta.construction_completed_date, "2026-07-01");
});

test("完工日非表示時はmemoフォールバックに完工日を含めない", () => {
  const meta = buildWorkflowPanelMetaPayload({
    settlement: { ...settlement, settlementType: "前金" },
    visibility: resolveWorkflowPanelFieldVisibility("前金"),
    loanStatus: "未申請",
    cardStatus: "未決済",
    completedDate: "",
    existingConstructionCompletedDate: "2026-07-01",
  });
  assert.equal(meta.construction_completed_date, "2026-07-01");
});

test("既存プルダウン選択肢を維持", () => {
  assert.deepEqual(LOAN_STATUSES, ["未申請", "申請中", "承認済", "否認"]);
  assert.deepEqual(CARD_STATUSES, [
    "未決済",
    "処理中",
    "決済成功",
    "決済失敗",
    "取消",
  ]);
});

test("WorkflowEngine / SETTLEMENT_RULES差分なし", () => {
  const fieldsSrc = readFileSync(
    join(process.cwd(), "app/cases/[id]/workflowPanelFields.ts"),
    "utf8"
  );
  const panelSrc = readFileSync(
    join(process.cwd(), "app/cases/[id]/WorkflowPanel.tsx"),
    "utf8"
  );
  assert.doesNotMatch(fieldsSrc, /from "@\/lib\/workflow\/WorkflowEngine"/);
  assert.doesNotMatch(fieldsSrc, /from "@\/lib\/workflow\/settlementRules"/);
  assert.doesNotMatch(panelSrc, /from "@\/lib\/workflow\/WorkflowEngine"/);
  assert.doesNotMatch(panelSrc, /from "@\/lib\/workflow\/settlementRules"/);
});

test("DB / API route / RPC / dealer差分なし（workflow panel scope）", () => {
  const panelSrc = readFileSync(
    join(process.cwd(), "app/cases/[id]/WorkflowPanel.tsx"),
    "utf8"
  );
  assert.doesNotMatch(panelSrc, /create_case_registration/);
  assert.doesNotMatch(panelSrc, /app\/dealer/);
});

test("WorkflowPanel uses read-only payment/delivery dates", () => {
  const src = readFileSync(
    join(process.cwd(), "app/cases/[id]/WorkflowPanel.tsx"),
    "utf8"
  );
  assert.match(src, /resolveLatestConfirmedPaymentDate/);
  assert.match(src, /resolveLatestOrderDeliveryDate/);
  assert.match(src, /ReadonlyField/);
  assert.match(src, /visibility\.showPaymentDate/);
  assert.match(src, /visibility\.showDeliveryDate/);
  assert.match(src, /visibility\.showCompletionDate/);
});

test("WorkflowPanel updates construction date only when editable", () => {
  const src = readFileSync(
    join(process.cwd(), "app/cases/[id]/WorkflowPanel.tsx"),
    "utf8"
  );
  assert.match(src, /if \(visibility\.showCompletionDate\)/);
});

test("formatWorkflowPanelDate empty → dash", () => {
  assert.equal(formatWorkflowPanelDate(null), "—");
});

test("single read-only field grid stays compact", () => {
  const cls = workflowPanelInputGridClass(
    resolveWorkflowPanelFieldVisibility("前金")
  );
  assert.equal(cls, "sm:grid-cols-1");
});
