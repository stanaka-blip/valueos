/**
 * 実行: npx tsx lib/prices/priceListQuery.test.ts
 */
import assert from "node:assert/strict";

import {
  collectPriceListCategories,
  filterPriceListRows,
  matchesPriceListSearch,
  parsePriceListQuery,
  type PriceListFilterRow,
} from "./priceListQuery";
import { resolveTargetDisplay } from "./resolveTargetDisplay";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

const supplierA = "11111111-1111-4111-8111-111111111111";
const supplierB = "22222222-2222-4222-8222-222222222222";
const makerNichicon = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const makerKyocera = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const rows: PriceListFilterRow[] = [
  {
    id: "1",
    partnerId: supplierA,
    manufacturerId: makerNichicon,
    manufacturerName: "ニチコン",
    priceTargetType: "PRODUCT",
    category: "蓄電池ユニット",
    code: "ES-A1",
    name: "蓄電池A",
    is_active: true,
  },
  {
    id: "2",
    partnerId: supplierA,
    manufacturerId: makerNichicon,
    manufacturerName: "ニチコン",
    priceTargetType: "PRODUCT",
    category: "パワコン",
    code: "PC-1",
    name: "パワコン1",
    is_active: false,
  },
  {
    id: "3",
    partnerId: supplierB,
    manufacturerId: makerKyocera,
    manufacturerName: "京セラ",
    priceTargetType: "PACKAGE",
    category: "標準セット",
    code: "PKG-K",
    name: "京セラセット",
    is_active: true,
  },
  {
    id: "4",
    partnerId: supplierA,
    manufacturerId: makerKyocera,
    manufacturerName: "京セラ",
    priceTargetType: "PACKAGE",
    category: "10kWh",
    code: "PKG-10",
    name: "10kWhパッケージ",
    is_active: true,
  },
];

test("仕入先のみ", () => {
  const q = parsePriceListQuery({
    supplier_id: supplierA,
    partnerParam: "supplier_id",
  });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["1", "2", "4"]
  );
});

test("販売店のみ（dealer_id）", () => {
  const q = parsePriceListQuery({
    dealer_id: supplierB,
    partnerParam: "dealer_id",
  });
  assert.equal(q.partnerId, supplierB);
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["3"]
  );
});

test("メーカーのみ", () => {
  const q = parsePriceListQuery({ manufacturer_id: makerKyocera });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["3", "4"]
  );
});

test("区分のみ PRODUCT", () => {
  const q = parsePriceListQuery({ price_target_type: "PRODUCT" });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["1", "2"]
  );
});

test("区分のみ PACKAGE", () => {
  const q = parsePriceListQuery({ price_target_type: "PACKAGE" });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["3", "4"]
  );
});

test("カテゴリのみ", () => {
  const q = parsePriceListQuery({ category: "蓄電池ユニット" });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["1"]
  );
});

test("状態のみ 無効", () => {
  const q = parsePriceListQuery({ status: "inactive" });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["2"]
  );
});

test("キーワードのみ（型番）", () => {
  const q = parsePriceListQuery({ q: "ES-A" });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["1"]
  );
});

test("キーワード（メーカー名）", () => {
  assert.equal(
    matchesPriceListSearch(rows[2], "京セラ"),
    true
  );
});

test("複数条件AND（仕入先×メーカー×カテゴリ）", () => {
  const q = parsePriceListQuery({
    supplier_id: supplierA,
    manufacturer_id: makerNichicon,
    category: "蓄電池ユニット",
    partnerParam: "supplier_id",
  });
  assert.deepEqual(
    filterPriceListRows(rows, q).map((r) => r.id),
    ["1"]
  );
});

test("0件", () => {
  const q = parsePriceListQuery({
    supplier_id: supplierB,
    manufacturer_id: makerNichicon,
    partnerParam: "supplier_id",
  });
  assert.equal(filterPriceListRows(rows, q).length, 0);
});

test("クリア相当（空query）は全件", () => {
  const q = parsePriceListQuery({});
  assert.equal(filterPriceListRows(rows, q).length, 4);
});

test("メーカー選択時カテゴリ候補を絞る", () => {
  const cats = collectPriceListCategories(rows, makerNichicon);
  assert.deepEqual(cats, ["パワコン", "蓄電池ユニット"]);
});

test("PACKAGE 表示区分は system_type 優先", () => {
  const d = resolveTargetDisplay(
    "PACKAGE",
    null,
    {
      name: "セット",
      package_code: "P1",
      capacity: 10,
      capacity_unit: "kWh",
      system_type: "標準セット",
      manufacturer_id: makerKyocera,
      manufacturers: { name: "京セラ" },
    }
  );
  assert.equal(d.category, "標準セット");
  assert.equal(d.code, "P1");
  assert.equal(d.manufacturerId, makerKyocera);
});

test("PRODUCT 表示区分は category", () => {
  const d = resolveTargetDisplay(
    "PRODUCT",
    {
      name: "蓄電池A",
      model_no: "ES-A1",
      category: "蓄電池ユニット",
      manufacturer_id: makerNichicon,
      manufacturers: { name: "ニチコン" },
    },
    null
  );
  assert.equal(d.category, "蓄電池ユニット");
  assert.equal(d.code, "ES-A1");
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
