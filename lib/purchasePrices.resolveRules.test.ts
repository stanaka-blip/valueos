/**
 * 仕入単価 resolve: 0円有効 / start_date 優先順位
 * Run: npx tsx lib/purchasePrices.resolveRules.test.ts
 */
import assert from "node:assert/strict";

import {
  comparePurchaseStartDatePriority,
  matchesActivePurchaseWindow,
  parsePurchaseUnitPrice,
  pickActivePurchaseUnitForTarget,
  sumPackageComponentPurchaseUnitPrices,
  type ListPurchasePriceCandidate,
} from "./purchasePrices";

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

const SUP = "11111111-1111-4111-8111-111111111111";
const PID = "33333333-3333-4333-8333-333333333333";
const AS_OF = "2026-09-15";

function cand(
  partial: Partial<ListPurchasePriceCandidate> & { purchase_price: unknown }
): ListPurchasePriceCandidate {
  return {
    targetId: PID,
    supplierId: SUP,
    start_date: null,
    end_date: null,
    is_active: true,
    ...partial,
  };
}

check("parse: null/empty/NaN/negative => null", () => {
  assert.equal(parsePurchaseUnitPrice(null), null);
  assert.equal(parsePurchaseUnitPrice(undefined), null);
  assert.equal(parsePurchaseUnitPrice(""), null);
  assert.equal(parsePurchaseUnitPrice("abc"), null);
  assert.equal(parsePurchaseUnitPrice(-1), null);
  assert.equal(parsePurchaseUnitPrice(Number.NaN), null);
});

check("parse: 0 is valid", () => {
  assert.equal(parsePurchaseUnitPrice(0), 0);
  assert.equal(parsePurchaseUnitPrice("0"), 0);
});

check("parse: positive is valid", () => {
  assert.equal(parsePurchaseUnitPrice(90000), 90000);
});

check("window: null start_date is active when end open", () => {
  assert.equal(
    matchesActivePurchaseWindow(
      { start_date: null, end_date: null, is_active: true },
      AS_OF
    ),
    true
  );
});

check("window: future start_date inactive", () => {
  assert.equal(
    matchesActivePurchaseWindow(
      { start_date: "2026-12-01", end_date: null, is_active: true },
      AS_OF
    ),
    false
  );
});

check("window: expired end_date inactive", () => {
  assert.equal(
    matchesActivePurchaseWindow(
      { start_date: null, end_date: "2026-01-01", is_active: true },
      AS_OF
    ),
    false
  );
});

check("priority: dated before null", () => {
  assert.ok(comparePurchaseStartDatePriority("2026-09-01", null) < 0);
  assert.ok(comparePurchaseStartDatePriority(null, "2026-09-01") > 0);
});

check("priority: newer dated first", () => {
  assert.ok(
    comparePurchaseStartDatePriority("2026-09-01", "2026-08-01") < 0
  );
});

check("pick: NULL only => NULL row", () => {
  const unit = pickActivePurchaseUnitForTarget(
    [cand({ start_date: null, purchase_price: 100000 })],
    PID,
    SUP,
    AS_OF
  );
  assert.equal(unit, 100000);
});

check("pick: NULL + dated => dated wins", () => {
  const unit = pickActivePurchaseUnitForTarget(
    [
      cand({ start_date: null, purchase_price: 100000 }),
      cand({ start_date: "2026-09-01", purchase_price: 90000 }),
    ],
    PID,
    SUP,
    AS_OF
  );
  assert.equal(unit, 90000);
});

check("pick: expired dated + NULL => NULL", () => {
  const unit = pickActivePurchaseUnitForTarget(
    [
      cand({
        start_date: "2026-01-01",
        end_date: "2026-06-30",
        purchase_price: 90000,
      }),
      cand({ start_date: null, purchase_price: 100000 }),
    ],
    PID,
    SUP,
    AS_OF
  );
  assert.equal(unit, 100000);
});

check("pick: multiple dated => latest effective", () => {
  const unit = pickActivePurchaseUnitForTarget(
    [
      cand({ start_date: "2026-08-01", purchase_price: 95000 }),
      cand({ start_date: "2026-09-01", purchase_price: 90000 }),
      cand({ start_date: "2026-07-01", purchase_price: 99000 }),
    ],
    PID,
    SUP,
    AS_OF
  );
  assert.equal(unit, 90000);
});

check("pick: explicit 0 yen is valid", () => {
  const unit = pickActivePurchaseUnitForTarget(
    [cand({ start_date: "2026-09-01", purchase_price: 0 })],
    PID,
    SUP,
    AS_OF
  );
  assert.equal(unit, 0);
});

check("pick: missing record => null", () => {
  const unit = pickActivePurchaseUnitForTarget([], PID, SUP, AS_OF);
  assert.equal(unit, null);
});

check("PACKAGE fallback sum: A×2 + B×1 = 40000", () => {
  const map = new Map<string, number>([
    ["A", 10000],
    ["B", 20000],
  ]);
  assert.equal(
    sumPackageComponentPurchaseUnitPrices(
      [
        { productId: "A", unitComponentQty: 2 },
        { productId: "B", unitComponentQty: 1 },
      ],
      map
    ),
    40000
  );
});

check("PACKAGE fallback: 0 yen component is valid", () => {
  const map = new Map<string, number>([
    ["A", 0],
    ["B", 20000],
  ]);
  assert.equal(
    sumPackageComponentPurchaseUnitPrices(
      [
        { productId: "A", unitComponentQty: 2 },
        { productId: "B", unitComponentQty: 1 },
      ],
      map
    ),
    20000
  );
});

check("PACKAGE fallback: missing component => null (no partial)", () => {
  const map = new Map<string, number>([["A", 10000]]);
  assert.equal(
    sumPackageComponentPurchaseUnitPrices(
      [
        { productId: "A", unitComponentQty: 2 },
        { productId: "B", unitComponentQty: 1 },
      ],
      map
    ),
    null
  );
});

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll purchase price resolve rule checks passed");
