/**
 * 案件詳細 決済UI — 詳細列クリア方針 / 検証の振る舞いテスト
 */
import {
  resolveSettlementDetailColumns,
  toSettlementViewData,
  validateSettlementDetailFields,
} from "../app/cases/[id]/settlementView.ts";
import type { CaseSettlementRow } from "../lib/database.types.ts";
import { CASE_SETTLEMENT_TYPES } from "../lib/caseSettlementTypes.ts";

function assert(name: string, cond: unknown, detail = "") {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
  } else {
    console.log("OK", name);
  }
}

const existing = {
  financeCompany: "既存信販",
  approvalNumber: "OLD-1",
  cardBrand: "既存カード",
};

const filled = {
  financeCompany: " 新信販 ",
  approvalNumber: " NEW-9 ",
  cardBrand: " Visa ",
};

// --- resolve: formal 4 + その他 ---
assert(
  "前金 clears all detail cols",
  JSON.stringify(resolveSettlementDetailColumns("前金", filled, existing)) ===
    JSON.stringify({
      finance_company: null,
      approval_number: null,
      card_brand: null,
    })
);

assert(
  "売掛 clears all detail cols",
  JSON.stringify(resolveSettlementDetailColumns("売掛", filled, existing)) ===
    JSON.stringify({
      finance_company: null,
      approval_number: null,
      card_brand: null,
    })
);

assert(
  "3社間 keeps finance/approval, clears card",
  JSON.stringify(
    resolveSettlementDetailColumns("3社間決済", filled, existing)
  ) ===
    JSON.stringify({
      finance_company: "新信販",
      approval_number: "NEW-9",
      card_brand: null,
    })
);

assert(
  "カード keeps brand, clears finance/approval",
  JSON.stringify(resolveSettlementDetailColumns("カード", filled, existing)) ===
    JSON.stringify({
      finance_company: null,
      approval_number: null,
      card_brand: "Visa",
    })
);

assert(
  "その他 preserves existing detail cols (no convert/delete)",
  JSON.stringify(
    resolveSettlementDetailColumns("その他", filled, existing)
  ) ===
    JSON.stringify({
      finance_company: "既存信販",
      approval_number: "OLD-1",
      card_brand: "既存カード",
    })
);

assert(
  "その他 with null existing stays null",
  JSON.stringify(resolveSettlementDetailColumns("その他", filled, null)) ===
    JSON.stringify({
      finance_company: null,
      approval_number: null,
      card_brand: null,
    })
);

// --- validate ---
assert(
  "前金 needs no detail",
  Object.keys(validateSettlementDetailFields("前金", filled)).length === 0
);
assert(
  "売掛 needs no detail",
  Object.keys(validateSettlementDetailFields("売掛", { ...filled, financeCompany: "", approvalNumber: "", cardBrand: "" })).length === 0
);
assert(
  "その他 needs no detail",
  Object.keys(
    validateSettlementDetailFields("その他", {
      financeCompany: "",
      approvalNumber: "",
      cardBrand: "",
    })
  ).length === 0
);

const sanshaEmpty = validateSettlementDetailFields("3社間決済", {
  financeCompany: "",
  approvalNumber: "",
  cardBrand: "",
});
assert("3社間 requires finance", !!sanshaEmpty.finance_company);
assert("3社間 requires approval", !!sanshaEmpty.approval_number);

const cardEmpty = validateSettlementDetailFields("カード", {
  financeCompany: "",
  approvalNumber: "",
  cardBrand: "",
});
assert("カード requires brand", !!cardEmpty.card_brand);

assert(
  "3社間 ok when filled",
  Object.keys(
    validateSettlementDetailFields("3社間決済", {
      financeCompany: "A",
      approvalNumber: "B",
      cardBrand: "",
    })
  ).length === 0
);

assert(
  "カード ok when filled",
  Object.keys(
    validateSettlementDetailFields("カード", {
      financeCompany: "",
      approvalNumber: "",
      cardBrand: "Visa",
    })
  ).length === 0
);

// --- view mapping ---
const row = {
  id: "s1",
  created_at: "",
  updated_at: "",
  case_id: "c1",
  settlement_type: "3社間決済",
  fee_rate: 1,
  fee_amount: 100,
  deposit_rate: null,
  deposit_amount: null,
  payment_terms: "翌月末",
  card_brand: null,
  finance_company: "信販X",
  approval_number: "AP-1",
  memo: "memo",
  loan_status: "承認済",
  loan_status_updated_at: null,
  card_status: null,
  card_status_updated_at: null,
} satisfies CaseSettlementRow;

const view = toSettlementViewData(row);
assert("toSettlementViewData finance", view.financeCompany === "信販X");
assert("toSettlementViewData approval", view.approvalNumber === "AP-1");
assert("toSettlementViewData type", view.settlementType === "3社間決済");
assert("toSettlementViewData keeps fee/memo/loan", view.feeAmount === 100 && view.memo === "memo" && view.loanStatus === "承認済");

assert(
  "CASE_SETTLEMENT_TYPES includes formal4 + その他",
  CASE_SETTLEMENT_TYPES.includes("前金") &&
    CASE_SETTLEMENT_TYPES.includes("売掛") &&
    CASE_SETTLEMENT_TYPES.includes("3社間決済") &&
    CASE_SETTLEMENT_TYPES.includes("カード") &&
    CASE_SETTLEMENT_TYPES.includes("その他")
);

if (process.exitCode) {
  console.error("\nbehavior failures");
  process.exit(1);
}
console.log("\nbehavior ok");
