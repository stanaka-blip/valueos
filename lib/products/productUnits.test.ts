/**
 * 商品単位 select 契約テスト
 * Run: npx tsx lib/products/productUnits.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getProductUnitSelectOptions,
  normalizeProductUnitInput,
  STANDARD_PRODUCT_UNITS,
} from "./productUnits";

test("標準候補に 枚 / kW / 台 / 個 / 本 / 式 を含む", () => {
  for (const unit of ["枚", "kW", "台", "個", "本", "式"] as const) {
    assert.ok(STANDARD_PRODUCT_UNITS.includes(unit));
  }
});

test("既存標準外 unit は options 先頭に残る（空欄化防止）", () => {
  const options = getProductUnitSelectOptions("セット");
  assert.equal(options[0], "セット");
  assert.ok(options.includes("枚"));
  assert.ok(options.includes("kW"));
});

test("標準 unit は重複追加しない", () => {
  const options = getProductUnitSelectOptions("枚");
  assert.equal(options.filter((u) => u === "枚").length, 1);
});

test("空 / null は標準候補のみ", () => {
  assert.deepEqual(getProductUnitSelectOptions(""), [...STANDARD_PRODUCT_UNITS]);
  assert.deepEqual(getProductUnitSelectOptions(null), [...STANDARD_PRODUCT_UNITS]);
});

test("normalize: 空白は null", () => {
  assert.equal(normalizeProductUnitInput("  kW  "), "kW");
  assert.equal(normalizeProductUnitInput("   "), null);
  assert.equal(normalizeProductUnitInput(""), null);
});
