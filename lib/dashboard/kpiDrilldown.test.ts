/**
 * ダッシュボード KPI 導線（既存一覧の query と未入金/期限超過の一致条件）
 * Run: npx tsx lib/dashboard/kpiDrilldown.test.ts
 */
import assert from "node:assert/strict";

import { aggregateDashboardV1 } from "./aggregateDashboardV1";
import {
  buildDashboardKpiHref,
  dashboardKpiBannerTitle,
  formatDashboardPeriodRange,
  matchesDashboardOverdueInvoice,
  matchesDashboardUnpaidInvoice,
} from "./kpiDrilldown";
import { summarizeDashboardInvoiceUnpaid } from "./invoiceUnpaid";

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

check("売上/粗利は /cases の請求日期間（from/to は使わない）", () => {
  const href = buildDashboardKpiHref("sales", {
    from: "2026-08-01",
    to: "2026-08-31",
  });
  assert.equal(
    href,
    "/cases?invoiceFrom=2026-08-01&invoiceTo=2026-08-31&fromDashboard=sales"
  );
  const salesParams = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  assert.equal(salesParams.has("from"), false);
  assert.equal(salesParams.has("to"), false);
  assert.equal(salesParams.get("invoiceFrom"), "2026-08-01");
  assert.equal(
    buildDashboardKpiHref("profit", { from: "2026-08-01", to: "2026-08-31" }),
    "/cases?invoiceFrom=2026-08-01&invoiceTo=2026-08-31&fromDashboard=profit"
  );
  assert.equal(
    buildDashboardKpiHref("profit-rate", {
      from: "2026-08-01",
      to: "2026-08-31",
    }),
    "/cases?invoiceFrom=2026-08-01&invoiceTo=2026-08-31&fromDashboard=profit-rate"
  );
});

check("未発注/未請求は既存 alert、未入金/期限超過は /payments", () => {
  assert.equal(
    buildDashboardKpiHref("unordered", { from: "2026-08-01", to: "2026-08-31" }),
    "/cases?alert=unordered&fromDashboard=unordered"
  );
  assert.equal(
    buildDashboardKpiHref("uninvoiced", {
      from: "2026-08-01",
      to: "2026-08-31",
    }),
    "/cases?alert=uninvoiced&fromDashboard=uninvoiced"
  );
  assert.equal(
    buildDashboardKpiHref("unpaid-amount", {
      from: "2026-08-01",
      to: "2026-08-31",
    }),
    "/payments?unpaid=1&fromDashboard=unpaid-amount"
  );
  assert.equal(
    buildDashboardKpiHref("unpaid", { from: "2026-08-01", to: "2026-08-31" }),
    "/payments?unpaid=1&fromDashboard=unpaid"
  );
  assert.equal(
    buildDashboardKpiHref("overdue", { from: "2026-08-01", to: "2026-08-31" }),
    "/payments?overdue=1&fromDashboard=overdue"
  );
});

check("バナー文言と期間表示", () => {
  assert.equal(dashboardKpiBannerTitle("sales"), "ダッシュボード: 売上対象");
  assert.equal(dashboardKpiBannerTitle("profit"), "ダッシュボード: 粗利対象");
  assert.equal(
    dashboardKpiBannerTitle("profit-rate"),
    "ダッシュボード: 粗利対象"
  );
  assert.equal(
    formatDashboardPeriodRange("2026-08-01", "2026-08-31"),
    "2026-08-01〜2026-08-31"
  );
});

check("periodCaseIds は請求日で売上対象になった案件と一致", () => {
  const r = aggregateDashboardV1({
    cases: [
      { id: "in", status: "受付済" },
      { id: "out", status: "受付済" },
      { id: "cancelled", status: "キャンセル" },
    ],
    invoices: [
      {
        case_id: "in",
        status: "発行済",
        invoice_amount: 100_000,
        invoice_date: "2026-08-10",
      },
      {
        case_id: "out",
        status: "発行済",
        invoice_amount: 50_000,
        invoice_date: "2026-07-10",
      },
      {
        case_id: "cancelled",
        status: "発行済",
        invoice_amount: 80_000,
        invoice_date: "2026-08-10",
      },
    ],
    orders: [],
    settlements: [],
    period: { from: "2026-08-01", to: "2026-08-31", grain: "day" },
  });
  assert.deepEqual(r.periodCaseIds, ["in"]);
  assert.equal(r.sales, 100_000);
});

check("未入金一覧条件は取消除外・残高>0（期限超過も含む）", () => {
  assert.equal(
    matchesDashboardUnpaidInvoice({ invoiceStatus: "発行済", unpaidAmount: 1 }),
    true
  );
  assert.equal(
    matchesDashboardUnpaidInvoice({ invoiceStatus: "取消", unpaidAmount: 1 }),
    false
  );
  assert.equal(
    matchesDashboardUnpaidInvoice({ invoiceStatus: "発行済", unpaidAmount: 0 }),
    false
  );
});

check("期限超過一覧は3社間を入れない", () => {
  assert.equal(
    matchesDashboardOverdueInvoice({
      invoiceStatus: "発行済",
      isThreeParty: false,
      displayStatus: "期限超過",
    }),
    true
  );
  assert.equal(
    matchesDashboardOverdueInvoice({
      invoiceStatus: "発行済",
      isThreeParty: true,
      displayStatus: "期限超過",
    }),
    false
  );
  const three = summarizeDashboardInvoiceUnpaid({
    invoiceAmount: 1_430_000,
    dueDate: "2026-07-01",
    payments: [],
    settlementType: "3社間決済",
    financeReceipts: [],
    dealerSettlements: [],
    today: "2026-08-01",
  });
  assert.equal(three.isOverdue, false);
  assert.equal(three.isUnpaidLike, true);
  assert.equal(
    matchesDashboardOverdueInvoice({
      invoiceStatus: "発行済",
      isThreeParty: true,
      displayStatus: "未入金",
    }),
    false
  );
  assert.equal(
    matchesDashboardUnpaidInvoice({
      invoiceStatus: "発行済",
      unpaidAmount: three.unpaidAmount,
    }),
    true
  );
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll kpiDrilldown checks passed");
