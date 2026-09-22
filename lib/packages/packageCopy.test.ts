/**
 * Run: npx tsx lib/packages/packageCopy.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPackageCopyFormValues,
  buildPackageCopyLines,
} from "./packageCopy";

test("パッケージヘッダをコピーし is_active は常に true", () => {
  const form = buildPackageCopyFormValues({
    manufacturer_id: "m1",
    series_id: "s1",
    name: "蓄電池セット",
    package_code: "PKG-1",
    capacity: 10.5,
    capacity_unit: "kWh",
    system_type: "単機能",
    warranty_years: 10,
    memo: "メモ",
    default_supplier_id: "sup1",
    is_active: false,
  });
  assert.equal(form.name, "蓄電池セット");
  assert.equal(form.package_code, "PKG-1");
  assert.equal(form.capacity, "10.5");
  assert.equal(form.is_active, true);
  assert.equal(form.default_supplier_id, "sup1");
});

test("構成商品と数量をコピー（item id は持たない）", () => {
  const lines = buildPackageCopyLines([
    { product_id: "p1", quantity: 2 },
    { product_id: "p2", quantity: "4.5" },
    { product_id: "", quantity: 1 },
  ]);
  assert.deepEqual(lines, [
    { product_id: "p1", quantity: "2" },
    { product_id: "p2", quantity: "4.5" },
  ]);
});

test("構成が空なら空行1つ", () => {
  assert.deepEqual(buildPackageCopyLines([]), [
    { product_id: "", quantity: "1" },
  ]);
});
