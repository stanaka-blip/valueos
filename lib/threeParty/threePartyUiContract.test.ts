import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { moneyActionApiPath } from "./moneyActionPaths";
import { buildDealerSettlementPrintModel } from "./dealerSettlementPrintModel";

const root = process.cwd();
const panels = readFileSync(
  join(root, "app/cases/[id]/ThreePartyMoneyPanels.tsx"),
  "utf8"
);
const caseDetail = readFileSync(
  join(root, "app/cases/[id]/CaseDetailView.tsx"),
  "utf8"
);
const submit = readFileSync(
  join(root, "app/cases/[id]/submitThreePartyMoney.ts"),
  "utf8"
);
const printPage = readFileSync(
  join(root, "app/dealer-settlements/[id]/print/page.tsx"),
  "utf8"
);

// 独立イベント: 仕入先支払 create に信販入金フィールドを要求しない
assert.ok(panels.includes("信販入金の有無は問いません"));
assert.ok(caseDetail.includes("支払管理"));
assert.ok(caseDetail.includes("variant=\"case_flow\""));
assert.ok(caseDetail.includes("金額・債務を確定する画面"));
assert.ok(caseDetail.includes("決済条件を編集"));
assert.ok(caseDetail.includes("に関わらず"));
assert.ok(caseDetail.includes("参考 / 暫定表示（v1）"));
assert.ok(caseDetail.includes("納品確認"));
assert.ok(caseDetail.includes("/orders/"));
assert.ok(!caseDetail.includes("3社間決済以外の仕入先支払も"));
assert.ok(panels.includes("case_flow"));
assert.ok(panels.includes("/queues/payments-management"));
assert.ok(panels.includes("?tab=supplier"));
assert.ok(panels.includes("信販入金を登録") || panels.includes("FinanceReceiptPaidForm"));
assert.ok(panels.includes("hidePay"));
assert.ok(panels.includes("信販入金（信販会社からの契約金）"));
assert.ok(panels.includes("信販入金額 − 有効請求額合計") || panels.includes("初期仕切額"));
assert.ok(!panels.includes("信販入金の予定を追加登録"));
assert.ok(!panels.includes("予定信販入金額"));
assert.ok(caseDetail.includes("請求額と信販入金額は別物"));
assert.ok(caseDetail.includes('section="finance"'));
assert.ok(caseDetail.includes("顧客入金（通常決済用・参考）"));
assert.ok(caseDetail.includes("実質回収額"));
assert.ok(caseDetail.includes("未入金残高"));
assert.ok(caseDetail.includes("二重登録") || panels.includes("二重登録"));
const financeForm = readFileSync(
  join(root, "app/components/threeParty/FinanceReceiptPaidForm.tsx"),
  "utf8"
);
assert.ok(financeForm.includes("finance_receipt.create"));
assert.ok(financeForm.includes("finance_receipt.confirm"));
assert.ok(financeForm.includes("登録時点で入金済"));
const collectionsClient = readFileSync(
  join(root, "app/queues/collections/CollectionsQueueClient.tsx"),
  "utf8"
);
assert.ok(collectionsClient.includes("FinanceReceiptPaidForm"));
assert.ok(collectionsClient.includes("allowsFinanceRegister"));
const paymentsBoard = readFileSync(
  join(root, "app/payments/PaymentsBoardClient.tsx"),
  "utf8"
);
assert.ok(paymentsBoard.includes("FinanceReceiptPaidForm"));
assert.ok(paymentsBoard.includes("実質回収"));
assert.ok(paymentsBoard.includes("needsFinanceRegister"));

const sidebar = readFileSync(
  join(root, "app/components/AppSidebar.tsx"),
  "utf8"
);
assert.ok(sidebar.includes('/queues/payments-management'));
assert.ok(sidebar.includes('name: "支払管理"'));
assert.ok(sidebar.includes('name: "入金管理"'));
assert.ok(sidebar.includes('href: "/payments"'));
assert.ok(sidebar.includes('name: "請求一覧"'));
assert.ok(sidebar.includes('href: "/invoices"'));

const invoiceDetail = readFileSync(
  join(root, "app/invoices/[id]/page.tsx"),
  "utf8"
);
assert.ok(invoiceDetail.includes("resolveInvoiceBackFrom"));
assert.ok(invoiceDetail.includes('value === "payments"'));
assert.ok(invoiceDetail.includes("入金管理へ戻る"));
assert.ok(invoiceDetail.includes("請求一覧へ戻る"));
assert.ok(invoiceDetail.includes("案件詳細へ戻る"));
assert.ok(!panels.includes('.from("finance_receipts")'));
assert.ok(!panels.includes('.from("dealer_settlements")'));
assert.ok(!panels.includes('.from("supplier_payments")'));
assert.ok(submit.includes("Idempotency-Key"));
assert.ok(submit.includes("X-CSRF-Token"));
assert.ok(submit.includes("Content-Type"));

// 仕入先支払は finance_receipt なしで API path が取れる
assert.equal(
  moneyActionApiPath({
    action: "supplier_payment.create",
    caseId: "11111111-1111-4111-8111-111111111111",
  }),
  "/api/cases/11111111-1111-4111-8111-111111111111/supplier-payments"
);

// 御振込金額の目立つ表示・計算式
assert.ok(panels.includes("販売店への御振込金額"));
assert.ok(panels.includes("確定（金額を固定）"));
assert.ok(panels.includes("確定済みの仕切金額は直接編集できません"));

// print 必須項目
for (const label of [
  "仕切清算書",
  "販売店",
  "案件番号",
  "顧客名",
  "発行日",
  "契約日",
  "納品日",
  "信販会社",
  "クレジット会社入金額",
  "弊社売上金額",
  "振込手数料",
  "御振込金額",
  "備考",
  "請求書とは別書類",
]) {
  assert.ok(printPage.includes(label), `print missing: ${label}`);
}

const model = buildDealerSettlementPrintModel({
  credit_received_amount: 1000,
  ve_share_amount: 300,
  payout_amount: 650,
  adjustment_total_amount: 50,
  lines: [
    {
      id: "1",
      line_kind: "transfer_fee",
      description: "手数料",
      amount: 50,
      sort_order: 1,
    },
  ],
});
assert.equal(model.recomputedPayout, 650);

console.log("threePartyUiContract.test.ts: ok");
