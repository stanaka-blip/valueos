/**
 * 信販入金1ステップ登録のマッピングテスト
 * 実行: npx tsx lib/threeParty/financeReceiptRegister.test.ts
 */
import assert from "node:assert/strict";

import {
  buildFinanceReceiptPaidConfirmBody,
  buildFinanceReceiptPaidCorrectBody,
  buildFinanceReceiptPaidCreateBody,
} from "@/lib/threeParty/financeReceiptRegister";
import {
  buildCollectionQueueRow,
  type CollectionQueueCaseInput,
} from "@/lib/queues/collectionQueue";
import { buildThreePartyPaymentQueueRow } from "@/lib/queues/paymentsManagementQueue";
import {
  calculateDealerSettlementPayout,
  suggestedDealerPayoutFromFinance,
  sumActiveInvoiceAmounts,
} from "@/lib/threeParty/dealerSettlementCalc";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("create body は実入金を scheduled_* に写す（予定UIを使わない）", () => {
  const body = buildFinanceReceiptPaidCreateBody({
    finance_company: "オリコ",
    actual_date: "2026-08-15",
    actual_amount: 1_800_000,
    memo: "着金",
  });
  assert.deepEqual(body, {
    finance_company: "オリコ",
    scheduled_date: "2026-08-15",
    scheduled_amount: 1_800_000,
    memo: "着金",
  });
});

test("confirm body は実入金日・実入金額のみ", () => {
  const body = buildFinanceReceiptPaidConfirmBody({
    actual_date: "2026-08-15",
    actual_amount: 1_800_000,
    memo: null,
  });
  assert.equal(body.actual_date, "2026-08-15");
  assert.equal(body.actual_amount, 1_800_000);
});

test("correct body も実入金写し", () => {
  const body = buildFinanceReceiptPaidCorrectBody({
    finance_company: "アプラス",
    actual_date: "2026-08-16",
    actual_amount: 100,
    memo: null,
  });
  assert.equal(body.scheduled_amount, 100);
  assert.equal(body.scheduled_date, "2026-08-16");
});

/**
 * VE-1786852027168:
 * 信販入金を直接登録（入金済）→ 回収完了 / 支払は仕切作成待ち / 仕切初期=信販-請求
 */
test("VE-1786852027168: 信販入金登録後は回収完了・支払は仕切作成待ち・初期370万", () => {
  const caseId = "6b7513ee-b3b3-4933-9b66-0a2a972a01f5";
  const financeAmount = 1_800_000;
  const invoiceAmount = 1_430_000;

  const createBody = buildFinanceReceiptPaidCreateBody({
    finance_company: "信販A",
    actual_date: "2026-08-15",
    actual_amount: financeAmount,
    memo: null,
  });
  const confirmBody = buildFinanceReceiptPaidConfirmBody({
    actual_date: "2026-08-15",
    actual_amount: financeAmount,
    memo: null,
  });
  assert.equal(createBody.scheduled_amount, financeAmount);
  assert.equal(confirmBody.actual_amount, financeAmount);

  const collectionBase: CollectionQueueCaseInput = {
    id: caseId,
    case_no: "VE-1786852027168",
    status: "納品済",
    customer_name: "顧客",
    order_received_date: "2026-08-01",
    dealer_name: "販売店",
    settlement_type: "3社間決済",
    deposit_amount: null,
    loan_status: "承認済",
    card_status: null,
    approval_number: "AP-PROD",
    construction_completed_date: "2026-08-11",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-08-10" }],
    payments: [],
    invoices: [
      {
        id: "inv1",
        status: "請求済",
        invoice_amount: invoiceAmount,
        due_date: null,
      },
    ],
    finance_receipts: [],
  };

  const waiting = buildCollectionQueueRow(collectionBase);
  assert.equal(waiting?.stateLabel, "信販入金待ち");

  const afterPaid = buildCollectionQueueRow({
    ...collectionBase,
    finance_receipts: [{ id: "fr1", status: "入金済" }],
  });
  assert.equal(afterPaid, null);

  const pay = buildThreePartyPaymentQueueRow({
    caseId,
    caseNo: "VE-1786852027168",
    caseStatus: "納品済",
    customerName: "顧客",
    dealerId: "d1",
    dealerName: "販売店",
    settlementType: "3社間決済",
    loanStatus: "承認済",
    approvalNumber: "AP-PROD",
    financeReceipts: [
      {
        id: "fr1",
        financeCompany: "信販A",
        status: "入金済",
        actualDate: "2026-08-15",
        actualAmount: financeAmount,
        scheduledAmount: financeAmount,
      },
    ],
    dealerSettlements: [],
    invoices: [{ id: "inv1", status: "請求済", invoiceAmount }],
    orders: [{ id: "o1", status: "納品済", deliveredDate: "2026-08-10" }],
    today: "2026-08-16",
  });
  assert.ok(pay);
  assert.equal(pay!.stage, "needs_settlement");
  assert.equal(pay!.stageLabel, "仕切未作成");
  assert.equal(pay!.suggestedPayoutAmount, 370_000);

  const invoiceTotal = sumActiveInvoiceAmounts([
    { status: "請求済", invoiceAmount },
  ]);
  assert.equal(
    suggestedDealerPayoutFromFinance({
      financeAmount,
      invoiceTotalAmount: invoiceTotal,
    }),
    370_000
  );
  assert.equal(
    calculateDealerSettlementPayout({
      creditReceivedAmount: financeAmount,
      veShareAmount: invoiceTotal,
      adjustmentLines: [{ line_kind: "transfer_fee", amount: 0 }],
    }).payoutAmount,
    370_000
  );
});

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`\n${failed}/${tests.length} failed`);
  process.exit(1);
}
console.log(`\n${tests.length}/${tests.length} passed`);
