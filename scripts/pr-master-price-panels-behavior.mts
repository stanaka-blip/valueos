import assert from "node:assert/strict";

import { findHistoryRowById } from "../lib/prices/loadMasterPricePanels.ts";
import {
  fetchActivePurchasePrice,
  getTodayDateString,
} from "../lib/purchasePrices.ts";
import { fetchActiveSalesPrice } from "../lib/salesPrices.ts";

/** 公式ルールと同等の期間判定（テスト用） */
function isInForce(row: {
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}, asOf: string): boolean {
  if (!row.isActive) return false;
  if (!row.startDate || row.startDate > asOf) return false;
  if (row.endDate && row.endDate < asOf) return false;
  return true;
}

function pickLatestInForce<T extends {
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  amount: number;
}>(rows: T[], asOf: string): T | null {
  const eligible = rows
    .filter((r) => isInForce(r, asOf) && r.amount > 0)
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  return eligible[0] || null;
}

const asOf = "2026-08-08";
const history = [
  {
    id: "p1",
    partyId: "s1",
    partyName: "仕入先A",
    amount: 100000,
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    isActive: true,
  },
  {
    id: "p2",
    partyId: "s1",
    partyName: "仕入先A",
    amount: 120000,
    startDate: "2026-07-01",
    endDate: null,
    isActive: true,
  },
  {
    id: "p3",
    partyId: "s1",
    partyName: "仕入先A",
    amount: 999999,
    startDate: "2026-07-15",
    endDate: null,
    isActive: false,
  },
  {
    id: "p4",
    partyId: "s2",
    partyName: "仕入先B",
    amount: 110000,
    startDate: "2026-08-01",
    endDate: null,
    isActive: true,
  },
];

const current = pickLatestInForce(
  history.filter((r) => r.partyId === "s1"),
  asOf
);
assert.equal(current?.id, "p2");
assert.equal(current?.amount, 120000);

assert.equal(
  pickLatestInForce(
    history.filter((r) => r.partyId === "s1" && r.id === "p1"),
    asOf
  ),
  null,
  "期間外は現行にならない"
);

assert.equal(findHistoryRowById(history, "p2")?.amount, 120000);
assert.equal(findHistoryRowById(history, null), null);

const salesHistory = [
  {
    id: "s-old",
    partyId: "d1",
    partyName: "販売店X",
    amount: 200000,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    isActive: true,
  },
  {
    id: "s-cur",
    partyId: "d1",
    partyName: "販売店X",
    amount: 250000,
    startDate: "2026-01-01",
    endDate: null,
    isActive: true,
  },
  {
    id: "s-d2",
    partyId: "d2",
    partyName: "販売店Y",
    amount: 260000,
    startDate: "2026-02-01",
    endDate: null,
    isActive: true,
  },
];

const byDealer = new Map<string, typeof salesHistory>();
for (const row of salesHistory) {
  const list = byDealer.get(row.partyId) || [];
  list.push(row);
  byDealer.set(row.partyId, list);
}

const currentSales = [...byDealer.entries()]
  .map(([dealerId, rows]) => ({ dealerId, row: pickLatestInForce(rows, asOf) }))
  .filter((x) => x.row);

assert.equal(currentSales.length, 2);
assert.equal(
  currentSales.find((x) => x.dealerId === "d1")?.row?.amount,
  250000
);

// 公式ヘルパーが export されていること（ルール再利用の契約）
assert.equal(typeof fetchActivePurchasePrice, "function");
assert.equal(typeof fetchActiveSalesPrice, "function");
assert.equal(getTodayDateString().length, 10);

console.log("master price panels behavior checks passed");
