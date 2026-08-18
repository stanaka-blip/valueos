/**
 * ダッシュボード v1 集計
 * Run: npx tsx lib/dashboard/aggregateDashboardV1.test.ts
 */
import assert from "node:assert/strict";

import { aggregateDashboardV1 } from "./aggregateDashboardV1";
import { computeConfirmedCaseProfit } from "@/lib/profit/caseProfitCalc";

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

const periodJune = { from: "2026-06-01", to: "2026-06-30", grain: "day" as const };

check("invoice 1,430,000 税込 → 売上（税抜） 1,300,000", () => {
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_430_000,
        invoice_date: "2026-06-10",
      },
    ],
    orders: [],
    settlements: [],
    period: periodJune,
  });
  assert.equal(r.sales, 1_300_000);
});

check("税スナップショットがあれば税抜売上に使う", () => {
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_100_000,
        subtotal_ex_tax: 1_000_000,
        tax_amount: 100_000,
        invoice_date: "2026-06-10",
      },
    ],
    orders: [],
    settlements: [],
    period: periodJune,
  });
  assert.equal(r.sales, 1_000_000);
});

check("取消請求は売上に入れない", () => {
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_430_000,
        invoice_date: "2026-06-10",
      },
      {
        case_id: "c1",
        status: "取消",
        invoice_amount: 4_000_000,
        invoice_date: "2026-06-10",
      },
    ],
    orders: [],
    settlements: [],
    period: periodJune,
  });
  assert.equal(r.sales, 1_300_000);
});

check("order 132,000 → 確定粗利の仕入 132,000（パッケージ order_amount）", () => {
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_430_000,
        invoice_date: "2026-06-10",
      },
    ],
    orders: [
      { case_id: "c1", status: "発注済", order_amount: 132_000 },
    ],
    settlements: [],
    period: periodJune,
  });
  const confirmed = computeConfirmedCaseProfit({
    invoices: [{ status: "発行済", invoiceAmount: 1_430_000 }],
    orders: [{ status: "発注済", orderAmount: 132_000 }],
  });
  assert.equal(confirmed.cost, 132_000);
  assert.equal(confirmed.revenue, 1_300_000);
  assert.equal(r.sales, 1_300_000);
  assert.equal(r.profit, confirmed.profit);
  assert.equal(r.profit, 1_300_000 - 132_000);
});

check("信販入金4,000,000でも売上は税抜1,300,000のまま（引数にCFを取らない）", () => {
  const finance = 4_000_000;
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_430_000,
        invoice_date: "2026-06-10",
      },
    ],
    orders: [{ case_id: "c1", status: "発注済", order_amount: 132_000 }],
    settlements: [],
    period: periodJune,
  });
  assert.equal(r.sales, 1_300_000);
  assert.notEqual(r.sales, finance);
});

check("販売店仕切2,570,000を粗利原価に入れない", () => {
  const dealerPayout = 2_570_000;
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_430_000,
        invoice_date: "2026-06-10",
      },
    ],
    orders: [{ case_id: "c1", status: "発注済", order_amount: 132_000 }],
    settlements: [],
    period: periodJune,
  });
  assert.equal(r.profit, 1_300_000 - 132_000);
  assert.notEqual(r.sales - r.profit, dealerPayout);
});

check("期間は請求日。受注日があっても使わない", () => {
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_430_000,
        invoice_date: "2026-07-02",
      },
    ],
    orders: [],
    settlements: [],
    period: periodJune,
  });
  assert.equal(r.sales, 0);
  assert.equal(r.profit, 0);
});

check("推移は請求日バケット。売上0なら粗利率0", () => {
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_430_000,
        invoice_date: "2026-06-10",
      },
    ],
    orders: [{ case_id: "c1", status: "発注済", order_amount: 132_000 }],
    settlements: [],
    period: periodJune,
  });
  const day = r.trend.find((t) => t.key === "2026-06-10");
  assert.ok(day);
  assert.equal(day?.sales, 1_300_000);
  assert.equal(day?.profit, 1_168_000);
  assert.equal(r.profitRate, (1_168_000 / 1_300_000) * 100);

  const empty = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [],
    orders: [],
    settlements: [],
    period: periodJune,
  });
  assert.equal(empty.sales, 0);
  assert.equal(empty.profitRate, 0);
});

check("手数料は caseProfitCalc と同じ（fee_amount・税抜売上分母）", () => {
  const r = aggregateDashboardV1({
    cases: [{ id: "c1", status: "受付済" }],
    invoices: [
      {
        case_id: "c1",
        status: "発行済",
        invoice_amount: 1_100_000,
        subtotal_ex_tax: 1_000_000,
        tax_amount: 100_000,
        invoice_date: "2026-06-01",
      },
    ],
    orders: [{ case_id: "c1", status: "発注済", order_amount: 600_000 }],
    settlements: [{ case_id: "c1", fee_amount: 10_000, fee_rate: 10 }],
    period: periodJune,
  });
  const confirmed = computeConfirmedCaseProfit({
    invoices: [
      {
        status: "発行済",
        invoiceAmount: 1_100_000,
        subtotalExTax: 1_000_000,
        taxAmount: 100_000,
      },
    ],
    orders: [{ status: "発注済", orderAmount: 600_000 }],
    fee: { feeAmount: 10_000, feeRate: 10 },
  });
  assert.equal(r.profit, confirmed.profit);
  assert.equal(r.sales, 1_000_000);
  assert.equal(r.profit, 390_000);
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll aggregateDashboardV1 checks passed");
