import assert from "node:assert/strict";

import {
  matchesActivePurchaseWindow,
  pickActivePurchaseUnitForTarget,
  type ListPurchasePriceCandidate,
} from "../lib/purchasePrices.ts";

const asOf = "2026-08-08";

const candidates: ListPurchasePriceCandidate[] = [
  {
    targetId: "p1",
    supplierId: "s1",
    purchase_price: 100000,
    start_date: "2026-01-01",
    end_date: "2026-06-30",
    is_active: true,
  },
  {
    targetId: "p1",
    supplierId: "s1",
    purchase_price: 120000,
    start_date: "2026-07-01",
    end_date: null,
    is_active: true,
  },
  {
    targetId: "p1",
    supplierId: "s1",
    purchase_price: 999999,
    start_date: "2026-07-15",
    end_date: null,
    is_active: false,
  },
  {
    targetId: "p1",
    supplierId: "s2",
    purchase_price: 150000,
    start_date: "2026-08-01",
    end_date: null,
    is_active: true,
  },
  {
    targetId: "pkg1",
    supplierId: "s1",
    purchase_price: 500000,
    start_date: "2026-05-01",
    end_date: null,
    is_active: true,
  },
];

assert.equal(
  pickActivePurchaseUnitForTarget(candidates, "p1", "s1", asOf),
  120000,
  "PRODUCT: 期間内の最新開始日を採用し無効を除外"
);

assert.equal(
  pickActivePurchaseUnitForTarget(candidates, "p1", "s2", asOf),
  150000,
  "標準仕入先ごとに判定"
);

assert.equal(
  pickActivePurchaseUnitForTarget(candidates, "pkg1", "s1", asOf),
  500000,
  "PACKAGE も同じ判定"
);

assert.equal(
  pickActivePurchaseUnitForTarget(candidates, "p1", "", asOf),
  null,
  "標準仕入先なしは null（画面は —）"
);

assert.equal(
  pickActivePurchaseUnitForTarget(candidates, "missing", "s1", asOf),
  null,
  "価格なしは null"
);

assert.equal(
  matchesActivePurchaseWindow(
    { start_date: "2026-01-01", end_date: "2026-06-30", is_active: true },
    asOf
  ),
  false,
  "期間外は除外"
);

assert.equal(
  matchesActivePurchaseWindow(
    { start_date: "2026-07-01", end_date: null, is_active: false },
    asOf
  ),
  false,
  "無効は除外"
);

const overlap = pickActivePurchaseUnitForTarget(
  [
    {
      targetId: "x",
      supplierId: "s",
      purchase_price: 10,
      start_date: "2026-01-01",
      end_date: null,
      is_active: true,
    },
    {
      targetId: "x",
      supplierId: "s",
      purchase_price: 20,
      start_date: "2026-08-01",
      end_date: null,
      is_active: true,
    },
  ],
  "x",
  "s",
  asOf
);
assert.equal(overlap, 20, "期間重複時は開始日の新しい価格");

console.log("list current purchase price behavior checks passed");
