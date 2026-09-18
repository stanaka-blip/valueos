/**
 * products.is_active 書き込み契約 / package 候補 / 新規選択ガード
 * Run: npx tsx lib/products/productActiveContract.test.ts
 */
import assert from "node:assert/strict";

import { buildProductCopyFormValues } from "@/app/components/masters/searchableSelect";
import { isProductActiveFlag } from "@/app/products/productListQuery";

import {
  assertNewProductSelectionsActive,
  buildPackageCompositionProductOption,
  collectNewOrderProductIds,
  collectProductIdsFromCaseRegistrationLines,
  filterProductsForPackageLineSelect,
  PRODUCT_INACTIVE_SELECT_MESSAGE,
  toProductActiveDbValue,
} from "./productActiveContract";

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

check('A: active → DB保存値 = "false" へのトグル契約', () => {
  assert.equal(toProductActiveDbValue(false), "false");
  assert.equal(isProductActiveFlag("false"), false);
});

check('B: inactive → DB保存値 = "true"', () => {
  assert.equal(toProductActiveDbValue(true), "true");
  assert.equal(isProductActiveFlag("true"), true);
});

check("C: package既存inactive構成 → edit候補に表示維持", () => {
  const products = [
    {
      id: "a",
      name: "Active",
      model_no: "A-1",
      manufacturer_id: "m1",
      is_active: "true",
    },
    {
      id: "b",
      name: "Stopped",
      model_no: "B-1",
      manufacturer_id: "m1",
      is_active: "false",
    },
    {
      id: "c",
      name: "OtherInactive",
      model_no: "C-1",
      manufacturer_id: "m1",
      is_active: "false",
    },
  ];
  const forLineB = filterProductsForPackageLineSelect(products, "b", "m1");
  assert.deepEqual(
    forLineB.map((p) => p.id).sort(),
    ["a", "b"]
  );
  const optionB = buildPackageCompositionProductOption(products[1]);
  assert.match(optionB.label, /利用停止/);
  assert.match(optionB.primaryText, /利用停止/);
});

check("D: 変更なし保存で既存inactiveは allow", () => {
  const guard = assertNewProductSelectionsActive(
    ["a", "b"],
    new Map([
      ["a", "true"],
      ["b", "false"],
    ]),
    new Set(["b"])
  );
  assert.equal(guard.ok, true);
});

check("E: inactiveを新規package構成へ追加 → reject", () => {
  const guard = assertNewProductSelectionsActive(
    ["b"],
    new Map([["b", "false"]]),
    new Set()
  );
  assert.equal(guard.ok, false);
  if (!guard.ok) {
    assert.equal(guard.message, PRODUCT_INACTIVE_SELECT_MESSAGE);
  }
});

check("F: inactive商品を案件新規明細へ → rejectメッセージ", () => {
  const ids = collectProductIdsFromCaseRegistrationLines([
    { line_type: "PRODUCT", product_id: "inactive-1" },
    { line_type: "PACKAGE", package_id: "pkg-1" },
  ]);
  assert.deepEqual(ids, ["inactive-1"]);
  const guard = assertNewProductSelectionsActive(
    ids,
    new Map([["inactive-1", "false"]])
  );
  assert.equal(guard.ok, false);
  if (!guard.ok) {
    assert.equal(guard.message, PRODUCT_INACTIVE_SELECT_MESSAGE);
  }
});

check("G: 既存案件のinactiveは編集保持（allow set）", () => {
  const guard = assertNewProductSelectionsActive(
    ["inactive-1"],
    new Map([["inactive-1", null]]),
    new Set(["inactive-1"])
  );
  assert.equal(guard.ok, true);
});

check("H: 発注の新規明細のみ active 必須", () => {
  const newIds = collectNewOrderProductIds({
    existingIds: new Set(["existing-row"]),
    incoming: [
      { id: "existing-row", product_id: "inactive-old" },
      { id: null, product_id: "inactive-new" },
    ],
  });
  assert.deepEqual(newIds, ["inactive-new"]);
  const guard = assertNewProductSelectionsActive(
    newIds,
    new Map([["inactive-new", "false"]])
  );
  assert.equal(guard.ok, false);
});

check('I: 複製は常に form active、DB書き込みは "true"', () => {
  const copied = buildProductCopyFormValues({
    manufacturer_id: "m1",
    series_id: null,
    category: null,
    model_no: "X",
    name: "Y",
    capacity: null,
    unit: null,
    memo: null,
    is_active: "false",
    default_supplier_id: null,
  });
  assert.equal(copied.is_active, true);
  assert.equal(toProductActiveDbValue(copied.is_active), "true");
});

check("null は inactive（新規選択不可）", () => {
  assert.equal(isProductActiveFlag(null), false);
  const guard = assertNewProductSelectionsActive(
    ["p1"],
    new Map([["p1", null]])
  );
  assert.equal(guard.ok, false);
});

check("他行のinactiveは新規候補に出ない", () => {
  const products = [
    { id: "a", manufacturer_id: "m1", is_active: "true" },
    { id: "b", manufacturer_id: "m1", is_active: "false" },
  ];
  const emptyLine = filterProductsForPackageLineSelect(products, "", "m1");
  assert.deepEqual(
    emptyLine.map((p) => p.id),
    ["a"]
  );
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll productActiveContract checks passed");
