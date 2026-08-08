/**
 * 既存商品Pickerの絞り込み回帰。
 * 実行: npx tsx lib/productSetup/existingProductPicker.test.ts
 */
import assert from "node:assert/strict";

import {
  isProductActiveFlag,
  matchesProductSearch,
  type ProductListRow,
} from "@/app/products/productListQuery";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

function filterByManufacturerAndSearch(
  rows: Array<ProductListRow & { seriesName?: string }>,
  manufacturerId: string,
  q: string
) {
  return rows.filter((row) => {
    if (!manufacturerId || row.manufacturer_id !== manufacturerId) return false;
    if (!isProductActiveFlag(row.is_active)) return false;
    return matchesProductSearch(row, q);
  });
}

const rows: Array<ProductListRow & { seriesName?: string }> = [
  {
    id: "p1",
    name: "トライブリッド",
    model_no: "ESS-T3",
    category: "蓄電池",
    is_active: true,
    manufacturer_id: "m-nichicon",
    manufacturerName: "ニチコン",
    seriesName: "トライブリッド",
  },
  {
    id: "p2",
    name: "別メーカー商品",
    model_no: "X-1",
    category: null,
    is_active: true,
    manufacturer_id: "m-other",
    manufacturerName: "他社",
    seriesName: "A",
  },
  {
    id: "p3",
    name: "停止商品",
    model_no: "ESS-OLD",
    category: null,
    is_active: false,
    manufacturer_id: "m-nichicon",
    manufacturerName: "ニチコン",
    seriesName: "旧",
  },
];

test("メーカー未選択は0件", () => {
  assert.equal(filterByManufacturerAndSearch(rows, "", "").length, 0);
});

test("メーカーで候補を絞る", () => {
  const r = filterByManufacturerAndSearch(rows, "m-nichicon", "");
  assert.deepEqual(
    r.map((x) => x.id),
    ["p1"]
  );
});

test("型番検索できる", () => {
  const r = filterByManufacturerAndSearch(rows, "m-nichicon", "ESS-T3");
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "p1");
});

test("商品名検索できる", () => {
  const r = filterByManufacturerAndSearch(rows, "m-nichicon", "トライ");
  assert.equal(r.length, 1);
});

test("停止商品は候補に出さない", () => {
  const r = filterByManufacturerAndSearch(rows, "m-nichicon", "ESS");
  assert.ok(!r.some((x) => x.id === "p3"));
});

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok - ${t.name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(e);
  }
}
if (failed > 0) process.exit(1);
console.log(`\n${tests.length - failed}/${tests.length} passed`);
