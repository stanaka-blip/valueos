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

test("前金は完工日のみ表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("前金");
  assert.equal(v.showLoanStatus, false);
  assert.equal(v.showCardStatus, false);
  assert.equal(v.showCompletionDate, true);
});

test("売掛は完工日のみ表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("売掛");
  assert.equal(v.showLoanStatus, false);
  assert.equal(v.showCardStatus, false);
  assert.equal(v.showCompletionDate, true);
});

test("カードはカードステータス＋完工日", () => {
  const v = resolveWorkflowPanelFieldVisibility("カード");
  assert.equal(v.showLoanStatus, false);
  assert.equal(v.showCardStatus, true);
  assert.equal(v.showCompletionDate, true);
});

test("カードではローンステータス非表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("カード");
  assert.equal(v.showLoanStatus, false);
});

test("3社間はローンステータス＋完工日", () => {
  const v = resolveWorkflowPanelFieldVisibility("3社間決済");
  assert.equal(v.showLoanStatus, true);
  assert.equal(v.showCardStatus, false);
  assert.equal(v.showCompletionDate, true);
});

test("3社間ではカードステータス非表示", () => {
  const v = resolveWorkflowPanelFieldVisibility("3社間決済");
  assert.equal(v.showCardStatus, false);
});

test("未設定は完工日のみ", () => {
  const v = resolveWorkflowPanelFieldVisibility("");
  assert.equal(v.showLoanStatus, false);
  assert.equal(v.showCardStatus, false);
  assert.equal(v.showCompletionDate, true);
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
  assert.equal(cardBody.loan_status_updated_at, undefined);

  const sanshaBody = buildWorkflowPanelSaveBody({
    settlement: { ...settlement, settlementType: "3社間決済" },
    visibility: resolveWorkflowPanelFieldVisibility("3社間決済"),
    loanStatus: "承認済",
    cardStatus: "未決済",
    now: "2026-08-05T00:00:00.000Z",
  });
  assert.equal(sanshaBody.loan_status, "承認済");
  assert.equal(sanshaBody.card_status, undefined);
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
    assert.equal(
      cardOnly.patch.loan_status_updated_at,
      "2026-01-01T00:00:00.000Z"
    );
    assert.equal(cardOnly.patch.card_status, "決済成功");
  }

  const sanshaOnly = buildSettlementSavePatch(
    {
      source: "workflow_panel",
      loan_status: "申請中",
      loan_status_updated_at: "2026-08-05T00:00:00.000Z",
    },
    { ...existing, settlement_type: "3社間決済" }
  );
  assert.equal(sanshaOnly.ok, true);
  if (sanshaOnly.ok) {
    assert.equal(sanshaOnly.patch.loan_status, "申請中");
    assert.equal(sanshaOnly.patch.card_status, "処理中");
    assert.equal(
      sanshaOnly.patch.card_status_updated_at,
      "2026-01-02T00:00:00.000Z"
    );
  }
});

test("memoフォールバックでも非表示項目の既存値を維持", () => {
  const meta = buildWorkflowPanelMetaPayload({
    settlement: { ...settlement, settlementType: "カード" },
    visibility: resolveWorkflowPanelFieldVisibility("カード"),
    loanStatus: "未申請",
    cardStatus: "決済成功",
    completedDate: "2026-08-05",
  });
  assert.equal(meta.loan_status, "承認済");
  assert.equal(meta.card_status, "決済成功");
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
  const workflowSrc = readFileSync(
    join(process.cwd(), "app/cases/[id]/WorkflowPanel.tsx"),
    "utf8"
  );
  assert.match(workflowSrc, /LOAN_STATUSES\.map/);
  assert.match(workflowSrc, /CARD_STATUSES\.map/);
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
  assert.match(
    readFileSync(join(process.cwd(), "lib/workflow/WorkflowEngine.ts"), "utf8"),
    /export function evaluateWorkflow/
  );
  assert.match(
    readFileSync(join(process.cwd(), "lib/workflow/settlementRules.ts"), "utf8"),
    /export const SETTLEMENT_RULES/
  );
});

test("DB / API route / RPC / dealer差分なし（workflow panel scope）", () => {
  const panelSrc = readFileSync(
    join(process.cwd(), "app/cases/[id]/WorkflowPanel.tsx"),
    "utf8"
  );
  assert.doesNotMatch(panelSrc, /create_case_registration/);
  assert.doesNotMatch(panelSrc, /app\/dealer/);
  assert.doesNotMatch(panelSrc, /supabase\/migrations/);
});

test("WorkflowPanel uses conditional field visibility", () => {
  const src = readFileSync(
    join(process.cwd(), "app/cases/[id]/WorkflowPanel.tsx"),
    "utf8"
  );
  assert.match(src, /resolveWorkflowPanelFieldVisibility/);
  assert.match(src, /buildWorkflowPanelSaveBody/);
  assert.match(src, /visibility\.showLoanStatus/);
  assert.match(src, /visibility\.showCardStatus/);
});

test("single completion date grid does not leave 3-column gap", () => {
  const cls = workflowPanelInputGridClass(
    resolveWorkflowPanelFieldVisibility("前金")
  );
  assert.equal(cls, "sm:grid-cols-1");
});
