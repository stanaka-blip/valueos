/**
 * 実行: npx tsx lib/payments/createPaymentPayload.test.ts
 */
import assert from "node:assert/strict";
import { buildPaymentInsertPayload } from "@/lib/payments/createPaymentPayload";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const invoice = {
  id: "inv-1",
  case_id: "case-1",
};

test("invoice_id 必須", () => {
  const r = buildPaymentInsertPayload({
    invoice,
    invoiceId: "",
    paymentDate: "2026-07-26",
    paymentAmount: 1000,
    paymentMethod: "銀行振込",
    status: "入金確認済",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /invoice_id/);
});

test("payment_amount 必須かつ 0 超", () => {
  const zero = buildPaymentInsertPayload({
    invoice,
    invoiceId: "inv-1",
    paymentDate: "2026-07-26",
    paymentAmount: 0,
    paymentMethod: "銀行振込",
    status: "入金確認済",
  });
  assert.equal(zero.ok, false);

  const missing = buildPaymentInsertPayload({
    invoice,
    invoiceId: "inv-1",
    paymentDate: "2026-07-26",
    paymentAmount: "",
    paymentMethod: "銀行振込",
    status: "入金確認済",
  });
  assert.equal(missing.ok, false);
});

test("case_id は invoices.case_id から決定", () => {
  const r = buildPaymentInsertPayload({
    invoice: { id: "inv-1", case_id: "case-from-invoice" },
    invoiceId: "inv-1",
    paymentDate: "2026-07-26",
    paymentAmount: 5000,
    paymentMethod: "現金",
    status: "確認待ち",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.payload.case_id, "case-from-invoice");
    assert.equal(r.payload.invoice_id, "inv-1");
  }
});

test("invoice.id と invoiceId 不一致は拒否", () => {
  const r = buildPaymentInsertPayload({
    invoice: { id: "inv-A", case_id: "case-1" },
    invoiceId: "inv-B",
    paymentDate: "2026-07-26",
    paymentAmount: 1000,
    paymentMethod: "銀行振込",
    status: "入金確認済",
  });
  assert.equal(r.ok, false);
});

test("請求に case_id が無い場合は拒否", () => {
  const r = buildPaymentInsertPayload({
    invoice: { id: "inv-1", case_id: null },
    invoiceId: "inv-1",
    paymentDate: "2026-07-26",
    paymentAmount: 1000,
    paymentMethod: "銀行振込",
    status: "入金確認済",
  });
  assert.equal(r.ok, false);
});

for (const t of tests) {
  try {
    t.run();
    console.log(`ok  - ${t.name}`);
  } catch (e) {
    console.log(`NG  - ${t.name}`);
    console.log(`     ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}
