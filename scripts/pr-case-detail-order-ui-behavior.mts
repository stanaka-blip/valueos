/**
 * PR-D1: 案件詳細からの発注画面 振る舞いテスト（DB書込なし）
 * 実行: npx tsx scripts/pr-case-detail-order-ui-behavior.mts
 */
import assert from "node:assert/strict";

import {
  applyMasterUnitPrices,
  buildInitialOrderLines,
  clearNonSnapshotUnitPrices,
  isProductCaseLine,
  isUnitPriceRealZero,
  isUnitPriceUnset,
  multiplyComponentAndPackageQty,
  parseOrderQuantity,
  parseUnitPriceInput,
  resolvePackageItemOrderQuantity,
  resolveSnapshotUnitPrice,
  type CasePackageSource,
  type CaseProductSource,
} from "../app/cases/[id]/buildOrderLines.ts";

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

check("parseOrderQuantity rejects 0/null/decimal/negative; accepts 1+", () => {
  assert.equal(parseOrderQuantity(1), 1);
  assert.equal(parseOrderQuantity("9999"), 9999);
  assert.equal(parseOrderQuantity(0), null);
  assert.equal(parseOrderQuantity(-1), null);
  assert.equal(parseOrderQuantity(1.5), null);
  assert.equal(parseOrderQuantity(""), null);
  assert.equal(parseOrderQuantity(null), null);
  assert.equal(parseOrderQuantity(undefined), null);
});

check("multiplyComponentAndPackageQty = 構成 × パッケージ", () => {
  assert.equal(multiplyComponentAndPackageQty(3, 2), 6);
  assert.equal(multiplyComponentAndPackageQty("4", "5"), 20);
  assert.equal(multiplyComponentAndPackageQty(0, 2), null);
  assert.equal(multiplyComponentAndPackageQty(2, null), null);
});

check("resolvePackageItemOrderQuantity uses stored 構成×パッケージ", () => {
  assert.equal(
    resolvePackageItemOrderQuantity({
      storedItemQuantity: 6,
      packageQuantity: 2,
    }),
    6
  );
  assert.equal(
    resolvePackageItemOrderQuantity({
      storedItemQuantity: 6,
      packageQuantity: 2,
      componentQuantity: 3,
    }),
    6
  );
  assert.equal(
    resolvePackageItemOrderQuantity({
      storedItemQuantity: null,
      packageQuantity: 2,
    }),
    null
  );
});

check("NULL snapshot vs real 0 snapshot", () => {
  const unset = resolveSnapshotUnitPrice(null, 2);
  assert.equal(unset.unitPrice, "");
  assert.equal(unset.hasCaseSnapshot, false);

  const zero = resolveSnapshotUnitPrice(0, 2);
  assert.equal(zero.unitPrice, "0");
  assert.equal(zero.hasCaseSnapshot, true);

  const priced = resolveSnapshotUnitPrice(2000, 2);
  assert.equal(priced.unitPrice, "1000");
  assert.equal(priced.hasCaseSnapshot, true);
});

check("isUnitPriceUnset vs real zero", () => {
  assert.equal(isUnitPriceUnset(""), true);
  assert.equal(isUnitPriceUnset("  "), true);
  assert.equal(isUnitPriceUnset("0"), false);
  assert.equal(isUnitPriceRealZero("0"), true);
  assert.equal(isUnitPriceRealZero(""), false);
  assert.equal(isUnitPriceRealZero("100"), false);
});

check("parseUnitPriceInput", () => {
  assert.equal(parseUnitPriceInput(""), null);
  assert.equal(parseUnitPriceInput("0"), 0);
  assert.equal(parseUnitPriceInput("1200"), 1200);
  assert.equal(parseUnitPriceInput("abc"), null);
});

check("PACKAGE header excluded; PRODUCT included", () => {
  assert.equal(
    isProductCaseLine({
      id: "1",
      line_type: "PACKAGE",
      product_id: null,
      quantity: 1,
      purchase_price: null,
      memo: null,
      products: null,
    }),
    false
  );
  assert.equal(
    isProductCaseLine({
      id: "2",
      line_type: "PRODUCT",
      product_id: "p1",
      quantity: 1,
      purchase_price: null,
      memo: null,
      products: null,
    }),
    true
  );
  assert.equal(
    isProductCaseLine({
      id: "3",
      line_type: "PACKAGE",
      product_id: "should-not-matter",
      quantity: 1,
      purchase_price: null,
      memo: null,
      products: null,
    }),
    false
  );
});

check("buildInitialOrderLines expands PRODUCT + PACKAGE items only", () => {
  const products: CaseProductSource[] = [
    {
      id: "cp-prod",
      line_type: "PRODUCT",
      product_id: "prod-1",
      quantity: 2,
      purchase_price: 2000,
      memo: null,
      products: { name: "商品A", model_no: "A-1" },
    },
    {
      id: "cp-pkg-header",
      line_type: "PACKAGE",
      product_id: null,
      quantity: 2,
      purchase_price: null,
      memo: null,
      products: null,
    },
  ];
  const packages: CasePackageSource[] = [
    {
      id: "pkg-1",
      quantity: 2,
      case_package_items: [
        {
          id: "item-1",
          product_id: "prod-2",
          quantity: 6, // 構成3 × パッケージ2
          unit_purchase_price: null,
          total_purchase_price: null,
          memo: null,
          is_selected: true,
          is_hidden: false,
          sort_order: 0,
          product_name_snapshot: "構成B",
          model_no_snapshot: "B-1",
          display_name_snapshot: null,
          products: null,
        },
        {
          id: "item-hidden",
          product_id: "prod-3",
          quantity: 2,
          unit_purchase_price: null,
          total_purchase_price: null,
          memo: null,
          is_selected: true,
          is_hidden: true,
          sort_order: 1,
          product_name_snapshot: "隠す",
          model_no_snapshot: null,
          display_name_snapshot: null,
          products: null,
        },
      ],
    },
  ];

  const lines = buildInitialOrderLines(products, packages);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].source, "PRODUCT");
  assert.equal(lines[0].quantity, "2");
  assert.equal(lines[0].unit_price, "1000");
  assert.equal(lines[0].has_case_snapshot, true);
  assert.equal(lines[1].source, "PACKAGE_ITEM");
  assert.equal(lines[1].quantity, "6");
  assert.equal(lines[1].unit_price, "");
  assert.equal(lines[1].has_case_snapshot, false);
  assert.equal(lines[1].case_product_id, null);
});

check("does not coerce invalid quantity to 1", () => {
  const lines = buildInitialOrderLines(
    [
      {
        id: "cp-bad",
        line_type: "PRODUCT",
        product_id: "prod-x",
        quantity: 0,
        purchase_price: null,
        memo: null,
        products: { name: "不正数量", model_no: null },
      },
    ],
    []
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, "");
});

check("applyMasterUnitPrices preserves snapshot including 0", () => {
  const base = buildInitialOrderLines(
    [
      {
        id: "cp1",
        line_type: "PRODUCT",
        product_id: "p1",
        quantity: 1,
        purchase_price: 0,
        memo: null,
        products: { name: "ゼロ単価", model_no: null },
      },
      {
        id: "cp2",
        line_type: "PRODUCT",
        product_id: "p2",
        quantity: 1,
        purchase_price: null,
        memo: null,
        products: { name: "未設定", model_no: null },
      },
    ],
    []
  );
  assert.equal(base[0].has_case_snapshot, true);
  assert.equal(base[0].unit_price, "0");

  const map = new Map<string, number>([
    ["p1", 9999],
    ["p2", 500],
  ]);
  const applied = applyMasterUnitPrices(base, map);
  assert.equal(applied.lines[0].unit_price, "0", "snapshot 0 not overwritten");
  assert.equal(applied.lines[1].unit_price, "500");
  assert.deepEqual(applied.missingProductNames, []);
});

check("clearNonSnapshotUnitPrices leaves unset empty", () => {
  const lines = clearNonSnapshotUnitPrices([
    {
      local_id: "a",
      product_id: "p1",
      case_product_id: "c1",
      product_name: "A",
      model_no: "",
      quantity: "1",
      unit_price: "100",
      memo: "",
      sort_order: 0,
      has_case_snapshot: true,
      source: "PRODUCT",
    },
    {
      local_id: "b",
      product_id: "p2",
      case_product_id: "c2",
      product_name: "B",
      model_no: "",
      quantity: "1",
      unit_price: "100",
      memo: "",
      sort_order: 1,
      has_case_snapshot: false,
      source: "PRODUCT",
    },
  ]);
  assert.equal(lines[0].unit_price, "100");
  assert.equal(lines[1].unit_price, "");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll behavior checks passed");
