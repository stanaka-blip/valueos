/**
 * 決済保存ロジック（DB非依存）振る舞いテスト
 */
import { buildSettlementSavePatch } from "../lib/caseSettlements/settlementSaveLogic.ts";
import type { CaseSettlementRow } from "../lib/database.types.ts";

function assert(name: string, cond: unknown, detail = "") {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
  } else {
    console.log("OK", name);
  }
}

function row(partial: Partial<CaseSettlementRow>): CaseSettlementRow {
  return {
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
    loan_status: "承認済",
    loan_status_updated_at: null,
    card_status: "未決済",
    card_status_updated_at: null,
    ...partial,
  };
}

// --- form: 3社間必須 ---
{
  const r = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: "3社間決済",
      finance_company: "",
      approval_number: "",
      fee_amount: 0,
    },
    null
  );
  assert("3社間 requires fields", !r.ok && r.error_code === "INVALID_INPUT");
  if (!r.ok) {
    assert("3社間 finance err", !!r.field_errors?.finance_company);
    assert("3社間 approval err", !!r.field_errors?.approval_number);
  }
}

{
  const r = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: "3社間決済",
      finance_company: "信販A",
      approval_number: "AP-1",
      fee_amount: 100,
    },
    null
  );
  assert("3社間 insert ok", r.ok);
  if (r.ok) {
    assert("3社間 finance saved", r.patch.finance_company === "信販A");
    assert("3社間 approval saved", r.patch.approval_number === "AP-1");
    assert("3社間 card null", r.patch.card_brand === null);
    assert("3社間 loan null on insert", r.patch.loan_status === null);
  }
}

// --- form: カード必須 ---
{
  const r = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: "カード",
      card_brand: "",
      fee_amount: 0,
    },
    null
  );
  assert("カード requires brand", !r.ok && !!r.field_errors?.card_brand);
}

{
  const r = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: "カード",
      card_brand: "Visa",
      fee_amount: 0,
    },
    null
  );
  assert("カード ok", r.ok && r.patch.card_brand === "Visa");
  if (r.ok) {
    assert("カード clears finance", r.patch.finance_company === null);
  }
}

// --- form: 前金/売掛 clear details ---
for (const type of ["前金", "売掛"] as const) {
  const r = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: type,
      finance_company: "X",
      approval_number: "Y",
      card_brand: "Z",
      fee_amount: 0,
    },
    row({
      finance_company: "旧",
      approval_number: "旧番",
      card_brand: "旧卡",
    })
  );
  assert(`${type} clears details`, r.ok);
  if (r.ok) {
    assert(
      `${type} all null`,
      r.patch.finance_company === null &&
        r.patch.approval_number === null &&
        r.patch.card_brand === null
    );
  }
}

// --- form: その他 preserve ---
{
  const r = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: "その他",
      finance_company: "フォーム入力は無視",
      approval_number: "ignore",
      card_brand: "ignore",
      fee_amount: 10,
      memo: "memo",
    },
    row({
      settlement_type: "その他",
      finance_company: "既存信販",
      approval_number: "既存承認",
      card_brand: "既存カード",
      loan_status: "申請中",
      card_status: "処理中",
    })
  );
  assert("その他 ok", r.ok);
  if (r.ok) {
    assert("その他 finance keep", r.patch.finance_company === "既存信販");
    assert("その他 approval keep", r.patch.approval_number === "既存承認");
    assert("その他 card keep", r.patch.card_brand === "既存カード");
    assert("その他 loan keep", r.patch.loan_status === "申請中");
    assert("その他 card status keep", r.patch.card_status === "処理中");
  }
}

// --- form preserves loan/card on update ---
{
  const r = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: "売掛",
      fee_amount: 0,
      loan_status: "否認",
      card_status: "取消",
    },
    row({ loan_status: "承認済", card_status: "決済成功" })
  );
  assert("form ignores client status overwrite", r.ok);
  if (r.ok) {
    assert("keeps loan", r.patch.loan_status === "承認済");
    assert("keeps card status", r.patch.card_status === "決済成功");
  }
}

// --- workflow: partial status update preserves omitted fields ---
{
  const r = buildSettlementSavePatch(
    {
      source: "workflow_panel",
      card_status: "決済成功",
      card_status_updated_at: "2026-08-05T00:00:00.000Z",
    },
    row({
      settlement_type: "カード",
      loan_status: "承認済",
      loan_status_updated_at: "2026-01-01T00:00:00.000Z",
      card_status: "処理中",
    })
  );
  assert("card-only workflow ok", r.ok);
  if (r.ok) {
    assert("card-only keeps loan", r.patch.loan_status === "承認済");
    assert(
      "card-only keeps loan updated_at",
      r.patch.loan_status_updated_at === "2026-01-01T00:00:00.000Z"
    );
    assert("card-only updates card", r.patch.card_status === "決済成功");
  }
}

// --- workflow: preserve details ---
{
  const r = buildSettlementSavePatch(
    {
      source: "workflow_panel",
      loan_status: "申請中",
      card_status: "処理中",
      finance_company: "攻撃的上書き",
      card_brand: "攻撃",
      settlement_type: "前金",
    },
    row({
      settlement_type: "3社間決済",
      finance_company: "信販X",
      approval_number: "AP-9",
      card_brand: null,
      fee_amount: 50,
      payment_terms: "翌月",
    })
  );
  assert("workflow ok", r.ok);
  if (r.ok) {
    assert("workflow keeps type", r.patch.settlement_type === "3社間決済");
    assert("workflow keeps finance", r.patch.finance_company === "信販X");
    assert("workflow keeps approval", r.patch.approval_number === "AP-9");
    assert("workflow keeps fee", r.patch.fee_amount === 50);
    assert("workflow sets loan", r.patch.loan_status === "申請中");
    assert("workflow sets card", r.patch.card_status === "処理中");
  }
}

{
  const r = buildSettlementSavePatch(
    { source: "workflow_panel", loan_status: "申請中" },
    null
  );
  assert("workflow requires existing", !r.ok);
}

{
  const r = buildSettlementSavePatch(
    {
      source: "workflow_panel",
      memo: "meta-only",
      update_status_columns: false,
    },
    row({ loan_status: "承認済", card_status: "決済成功" })
  );
  assert("workflow memo-only keeps status", r.ok);
  if (r.ok) {
    assert("memo-only loan", r.patch.loan_status === "承認済");
    assert("memo-only no updated_at", r.patch.loan_status_updated_at === undefined);
  }
}

// INSERT vs UPDATE signal is in saveCaseSettlement (DB). Logic-level: null existing => insert patch.
{
  const r = buildSettlementSavePatch(
    { source: "settlement_form", settlement_type: "前金", fee_amount: 0 },
    null
  );
  assert("insert-shaped patch", r.ok && r.patch.settlement_type === "前金");
}

if (process.exitCode) {
  console.error("\nbehavior failures");
  process.exit(1);
}
console.log("\nbehavior ok");
