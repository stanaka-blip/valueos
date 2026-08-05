/**
 * 発注登録 Workflow admin 読取 behavior テスト
 * Run: npx tsx scripts/pr-order-workflow-admin-load-behavior.mts
 */
import assert from "node:assert/strict";

import { evaluateCaseWorkflowFromSettlement } from "../lib/workflow/evaluateCaseWorkflowFromSettlement.ts";

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

const emptyRelated = {
  constructionCompletedDate: null,
  orders: [],
  invoices: [],
  payments: [],
};

check("売掛の決済行があれば未設定警告にならない", () => {
  const result = evaluateCaseWorkflowFromSettlement({
    settlementResult: {
      ok: true,
      data: {
        id: "s1",
        created_at: "",
        updated_at: "",
        case_id: "c1",
        settlement_type: "売掛",
        fee_rate: null,
        fee_amount: 0,
        deposit_rate: null,
        deposit_amount: null,
        payment_terms: null,
        card_brand: null,
        finance_company: null,
        approval_number: null,
        memo: null,
        loan_status: null,
        loan_status_updated_at: null,
        card_status: null,
        card_status_updated_at: null,
      },
    },
    related: emptyRelated,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.settlementMissing, false);
  assert.equal(result.result.ruleKey, "売掛");
  assert.equal(result.result.canOrder, true);
  assert.equal(
    result.result.warnings.includes("決済区分が未設定です"),
    false
  );
});

check("決済行なしは本当の未設定", () => {
  const result = evaluateCaseWorkflowFromSettlement({
    settlementResult: { ok: true, data: null },
    related: emptyRelated,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.settlementMissing, true);
  assert.equal(result.result.ruleKey, null);
  assert.ok(result.result.warnings.includes("決済区分が未設定です"));
});

check("決済取得失敗は未設定扱いにしない", () => {
  const result = evaluateCaseWorkflowFromSettlement({
    settlementResult: {
      ok: false,
      error_code: "SETTLEMENT_READ_FAILED",
      error_message: "決済条件の取得に失敗しました",
    },
    related: emptyRelated,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error_code, "SETTLEMENT_READ_FAILED");
});

check("関連データ取得失敗もエラー", () => {
  const result = evaluateCaseWorkflowFromSettlement({
    settlementResult: { ok: true, data: null },
    related: emptyRelated,
    relatedError: "orders failed",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error_code, "RELATED_READ_FAILED");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll order workflow admin load behavior checks passed");
