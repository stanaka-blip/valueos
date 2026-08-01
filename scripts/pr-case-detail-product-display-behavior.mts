/**
 * PR-A: 案件詳細 商品表示ヘルパーの振る舞いテスト
 * 実行: npx tsx scripts/pr-case-detail-product-display-behavior.mts
 */
import assert from "node:assert/strict";

import {
  formatNullableYen,
  formatProfitRate,
  lineTypeLabel,
  normalizeLineType,
  resolveDisplayName,
  sumNullableAmounts,
  toCaseProductDisplayRow,
  toNullableNumber,
} from "../app/cases/[id]/productDisplay.ts";

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

check("null vs 0 for prices", () => {
  assert.equal(toNullableNumber(null), null);
  assert.equal(toNullableNumber(undefined), null);
  assert.equal(toNullableNumber(""), null);
  assert.equal(toNullableNumber(0), 0);
  assert.equal(toNullableNumber("0"), 0);
  assert.equal(toNullableNumber(12345), 12345);
  assert.equal(toNullableNumber("not-a-number"), null);
});

check("formatNullableYen distinguishes null and 0", () => {
  assert.equal(formatNullableYen(null), "—");
  assert.equal(formatNullableYen(undefined), "—");
  assert.equal(formatNullableYen(0), "0円");
  assert.equal(formatNullableYen(1000), "1,000円");
  assert.equal(formatNullableYen(null, "未設定"), "未設定");
});

check("line type labels", () => {
  assert.equal(normalizeLineType("PRODUCT"), "PRODUCT");
  assert.equal(normalizeLineType("package"), "PACKAGE");
  assert.equal(normalizeLineType(null), "PRODUCT");
  assert.equal(lineTypeLabel("PRODUCT"), "商品");
  assert.equal(lineTypeLabel("PACKAGE"), "パッケージ");
});

check("PRODUCT uses product name", () => {
  assert.equal(
    resolveDisplayName("PRODUCT", "ヒートポンプ", "パッケージA"),
    "ヒートポンプ"
  );
  const row = toCaseProductDisplayRow("p1", {
    line_type: "PRODUCT",
    product_id: "prod-1",
    package_id: null,
    quantity: 2,
    purchase_price: 10000,
    sales_price: 15000,
    gross_profit: 5000,
    productName: "ヒートポンプ",
    packageName: "無視される",
    modelNo: "HP-1",
  });
  assert.equal(row.lineTypeLabel, "商品");
  assert.equal(row.nameLabel, "商品名");
  assert.equal(row.displayName, "ヒートポンプ");
  assert.equal(row.quantity, "2");
  assert.equal(row.salesPrice, 15000);
  assert.equal(formatNullableYen(row.salesPrice), "15,000円");
  assert.equal(formatProfitRate(row.salesPrice, row.grossProfit), "33.3%");
});

check("PACKAGE uses package name not dash", () => {
  const row = toCaseProductDisplayRow("pkg1", {
    line_type: "PACKAGE",
    product_id: null,
    package_id: "pkg-uuid",
    quantity: 1,
    purchase_price: null,
    sales_price: null,
    gross_profit: null,
    productName: "",
    packageName: "エコキュート標準セット",
  });
  assert.equal(row.lineTypeLabel, "パッケージ");
  assert.equal(row.nameLabel, "パッケージ名");
  assert.equal(row.displayName, "エコキュート標準セット");
  assert.equal(formatNullableYen(row.salesPrice), "—");
  assert.equal(formatNullableYen(row.purchasePrice), "—");
  assert.equal(formatNullableYen(row.grossProfit), "—");
  assert.equal(formatProfitRate(row.salesPrice, row.grossProfit), "—");
});

check("sumNullableAmounts ignores null and avoids NaN", () => {
  const total = sumNullableAmounts([null, 1000, undefined, 0, 2500]);
  assert.equal(total, 3500);
  assert.equal(Number.isNaN(total), false);
  assert.equal(sumNullableAmounts([null, null]), 0);
});

check("zero-priced existing row stays 0円", () => {
  const row = toCaseProductDisplayRow("z1", {
    line_type: "PRODUCT",
    quantity: 1,
    purchase_price: 0,
    sales_price: 0,
    gross_profit: 0,
    productName: "旧明細",
  });
  assert.equal(formatNullableYen(row.salesPrice), "0円");
  assert.equal(formatNullableYen(row.purchasePrice), "0円");
  assert.equal(formatNullableYen(row.grossProfit), "0円");
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
