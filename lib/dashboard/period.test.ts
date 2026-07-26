/**
 * 実行: npx tsx lib/dashboard/period.test.ts
 */
import assert from "node:assert/strict";
import {
  enumerateBuckets,
  resolveGrain,
  resolvePeriod,
} from "@/lib/dashboard/period";

const now = new Date(2026, 6, 26, 12); // 2026-07-26

{
  const p = resolvePeriod({ preset: "this_month", now });
  assert.equal(p.from, "2026-07-01");
  assert.equal(p.to, "2026-07-31");
  assert.equal(p.grain, "day");
  console.log("ok  - 今月");
}

{
  const p = resolvePeriod({ preset: "last_month", now });
  assert.equal(p.from, "2026-06-01");
  assert.equal(p.to, "2026-06-30");
  assert.equal(p.grain, "day");
  console.log("ok  - 先月");
}

{
  const p = resolvePeriod({ preset: "this_year", now });
  assert.equal(p.from, "2026-01-01");
  assert.equal(p.to, "2026-07-26");
  assert.equal(p.grain, "month");
  console.log("ok  - 今年");
}

{
  const p = resolvePeriod({ preset: "last_12_months", now });
  assert.equal(p.from, "2025-08-01");
  assert.equal(p.to, "2026-07-26");
  assert.equal(p.grain, "month");
  console.log("ok  - 過去12ヶ月");
}

{
  const p = resolvePeriod({
    preset: "custom",
    from: "2026-07-01",
    to: "2026-07-10",
    now,
  });
  assert.equal(p.grain, "day");
  assert.equal(resolveGrain("custom", "2026-01-01", "2026-07-01"), "month");
  console.log("ok  - カスタム粒度");
}

{
  const days = enumerateBuckets("2026-07-01", "2026-07-03", "day");
  assert.deepEqual(days, ["2026-07-01", "2026-07-02", "2026-07-03"]);
  const months = enumerateBuckets("2026-01-15", "2026-03-01", "month");
  assert.deepEqual(months, ["2026-01", "2026-02", "2026-03"]);
  console.log("ok  - buckets");
}

console.log("period tests passed");
