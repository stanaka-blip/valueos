/**
 * 実行: npx tsx lib/dashboard/salesByOrderReceived.test.ts
 */
import assert from "node:assert/strict";
import { aggregateSalesByOrderReceived } from "@/lib/dashboard/salesByOrderReceived";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  - ${name}`);
  } catch (e) {
    console.log(`NG  - ${name}`);
    console.log(`     ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}

run("受注日と明細登録日が異なる場合は受注日の月に集計", () => {
  const r = aggregateSalesByOrderReceived({
    cases: [
      {
        id: "c1",
        status: "受付済",
        order_received_date: "2026-06-30",
      },
    ],
    products: [
      {
        case_id: "c1",
        // 明細登録日は使わない想定データ
        sales_price: 100000,
        gross_profit: 30000,
      },
    ],
    period: { from: "2026-06-01", to: "2026-06-30", grain: "day" },
  });
  assert.equal(r.sales, 100000);
  assert.equal(r.profit, 30000);
  const june30 = r.trend.find((t) => t.key === "2026-06-30");
  assert.ok(june30);
  assert.equal(june30?.sales, 100000);

  const july = aggregateSalesByOrderReceived({
    cases: [
      { id: "c1", status: "受付済", order_received_date: "2026-06-30" },
    ],
    products: [{ case_id: "c1", sales_price: 100000, gross_profit: 30000 }],
    period: { from: "2026-07-01", to: "2026-07-31", grain: "day" },
  });
  assert.equal(july.sales, 0);
});

run("同一案件の複数商品は同じ受注日バケットへ集計", () => {
  const r = aggregateSalesByOrderReceived({
    cases: [
      { id: "c1", status: "受付済", order_received_date: "2026-07-15" },
    ],
    products: [
      { case_id: "c1", sales_price: 40000, gross_profit: 10000 },
      { case_id: "c1", sales_price: 60000, gross_profit: 20000 },
    ],
    period: { from: "2026-07-01", to: "2026-07-31", grain: "day" },
  });
  assert.equal(r.sales, 100000);
  assert.equal(r.profit, 30000);
  const day = r.trend.find((t) => t.key === "2026-07-15");
  assert.equal(day?.sales, 100000);
  assert.equal(day?.profit, 30000);
});

run("受注日変更で集計月が移動する", () => {
  const before = aggregateSalesByOrderReceived({
    cases: [
      { id: "c1", status: "受付済", order_received_date: "2026-06-30" },
    ],
    products: [{ case_id: "c1", sales_price: 100000, gross_profit: 25000 }],
    period: { from: "2026-06-01", to: "2026-07-31", grain: "month" },
  });
  assert.equal(before.trend.find((t) => t.key === "2026-06")?.sales, 100000);
  assert.equal(before.trend.find((t) => t.key === "2026-07")?.sales, 0);

  const after = aggregateSalesByOrderReceived({
    cases: [
      { id: "c1", status: "受付済", order_received_date: "2026-07-01" },
    ],
    products: [{ case_id: "c1", sales_price: 100000, gross_profit: 25000 }],
    period: { from: "2026-06-01", to: "2026-07-31", grain: "month" },
  });
  assert.equal(after.trend.find((t) => t.key === "2026-06")?.sales, 0);
  assert.equal(after.trend.find((t) => t.key === "2026-07")?.sales, 100000);
});

run("キャンセル案件は受注日が期間内でも集計対象外", () => {
  const r = aggregateSalesByOrderReceived({
    cases: [
      { id: "c1", status: "キャンセル", order_received_date: "2026-07-10" },
      { id: "c2", status: "受付済", order_received_date: "2026-07-10" },
    ],
    products: [
      { case_id: "c1", sales_price: 99999, gross_profit: 9999 },
      { case_id: "c2", sales_price: 50000, gross_profit: 10000 },
    ],
    period: { from: "2026-07-01", to: "2026-07-31", grain: "day" },
  });
  assert.equal(r.sales, 50000);
  assert.deepEqual(r.periodCaseIds, ["c2"]);
});

run("KPI対象案件IDは受注日期間と一致", () => {
  const r = aggregateSalesByOrderReceived({
    cases: [
      { id: "in", status: "受付済", order_received_date: "2026-07-05" },
      { id: "out", status: "受付済", order_received_date: "2026-06-05" },
    ],
    products: [
      { case_id: "in", sales_price: 1, gross_profit: 1 },
      { case_id: "out", sales_price: 1, gross_profit: 1 },
    ],
    period: { from: "2026-07-01", to: "2026-07-31", grain: "day" },
  });
  assert.deepEqual(r.periodCaseIds, ["in"]);
});

console.log("salesByOrderReceived tests done");
