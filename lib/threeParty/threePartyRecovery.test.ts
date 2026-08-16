/**
 * 3社間の実質回収・二重登録ガードのユニットテスト
 * 実行: npx tsx lib/threeParty/threePartyRecovery.test.ts
 */
import assert from "node:assert/strict";

import {
  computeThreePartyRecoveryAmounts,
  financeReceiptCreateBlockReason,
  hasActiveFinanceReceipt,
  sumDealerPaidAmount,
} from "@/lib/threeParty/threePartyRecovery";
import { buildCollectionQueueRow } from "@/lib/queues/collectionQueue";
import { buildThreePartyPaymentQueueRow } from "@/lib/queues/paymentsManagementQueue";
import { suggestedDealerPayoutFromFinance } from "@/lib/threeParty/dealerSettlementCalc";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("二重登録: 入金済があると create をブロック", () => {
  const reason = financeReceiptCreateBlockReason([
    { status: "取消" },
    { status: "入金済" },
  ]);
  assert.ok(reason);
  assert.ok(reason!.includes("二重登録"));
});

test("二重登録: 予定もブロック（救済は confirm）", () => {
  assert.ok(financeReceiptCreateBlockReason([{ status: "予定" }]));
  assert.equal(financeReceiptCreateBlockReason([{ status: "取消" }]), null);
  assert.equal(hasActiveFinanceReceipt([{ status: "予定" }]), true);
});

test("VE-1786852027168: 回収から登録相当→支払は仕切待ち・初期370万・二重不可", () => {
  const caseId = "6b7513ee-b3b3-4933-9b66-0a2a972a01f5";
  const finance = 1_800_000;
  const invoice = 1_430_000;

  const waiting = buildCollectionQueueRow({
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
    approval_number: "AP",
    construction_completed_date: "2026-08-11",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-08-10" }],
    payments: [],
    invoices: [
      {
        id: "inv1",
        status: "請求済",
        invoice_amount: invoice,
        due_date: null,
      },
    ],
    finance_receipts: [],
  });
  assert.equal(waiting?.stateLabel, "信販入金待ち");
  assert.equal(waiting?.allowsFinanceRegister, true);
  assert.equal(waiting?.nextAction, "信販入金を登録");

  // 入金管理即反映相当: 入金済なら回収から消える
  const after = buildCollectionQueueRow({
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
    approval_number: "AP",
    construction_completed_date: "2026-08-11",
    orders: [{ id: "o1", status: "納品済", delivered_date: "2026-08-10" }],
    payments: [],
    invoices: [
      {
        id: "inv1",
        status: "請求済",
        invoice_amount: invoice,
        due_date: null,
      },
    ],
    finance_receipts: [{ id: "fr1", status: "入金済" }],
  });
  assert.equal(after, null);
  assert.ok(
    financeReceiptCreateBlockReason([{ status: "入金済" }])
  );

  const pay = buildThreePartyPaymentQueueRow({
    caseId,
    caseNo: "VE-1786852027168",
    caseStatus: "納品済",
    customerName: "顧客",
    dealerId: "d1",
    dealerName: "販売店",
    settlementType: "3社間決済",
    loanStatus: "承認済",
    approvalNumber: "AP",
    financeReceipts: [
      {
        id: "fr1",
        financeCompany: "信販",
        status: "入金済",
        actualDate: "2026-08-15",
        actualAmount: finance,
        scheduledAmount: finance,
      },
    ],
    dealerSettlements: [],
    invoices: [{ id: "inv1", status: "請求済", invoiceAmount: invoice }],
    orders: [{ id: "o1", status: "納品済", deliveredDate: "2026-08-10" }],
    today: "2026-08-16",
  });
  assert.equal(pay?.stage, "needs_settlement");
  assert.equal(pay?.suggestedPayoutAmount, 370_000);
  assert.equal(
    suggestedDealerPayoutFromFinance({
      financeAmount: finance,
      invoiceTotalAmount: invoice,
    }),
    370_000
  );
});

test("支払後: 実質回収額・未入金残高が整合", () => {
  const invoice = 1_430_000;
  const finance = 1_800_000;
  const dealerPaid = sumDealerPaidAmount([
    {
      status: "支払済",
      actualPayoutAmount: 370_000,
      payoutAmount: 370_000,
    },
  ]);
  assert.equal(dealerPaid, 370_000);
  const r = computeThreePartyRecoveryAmounts({
    invoiceTotalAmount: invoice,
    financePaidAmount: finance,
    dealerPaidAmount: dealerPaid,
  });
  // 実質回収 = 180万 - 37万 = 143万 = 商品請求
  assert.equal(r.effectiveRecoveryAmount, 1_430_000);
  assert.equal(r.unpaidBalance, 0);
});

test("信販未入金時の未入金残高は請求額", () => {
  const r = computeThreePartyRecoveryAmounts({
    invoiceTotalAmount: 1_430_000,
    financePaidAmount: null,
    dealerPaidAmount: 0,
  });
  assert.equal(r.effectiveRecoveryAmount, 0);
  assert.equal(r.unpaidBalance, 1_430_000);
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
