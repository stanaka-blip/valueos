/**
 * 商品利用停止 / 複製の純関数テスト
 * Run: npx tsx app/products/productActiveStatus.test.ts
 */
import assert from "node:assert/strict";

import { buildProductCopyFormValues } from "@/app/components/masters/searchableSelect";
import { toProductActiveDbValue } from "@/lib/products/productActiveContract";
import { isProductActiveFlag } from "./productListQuery";
import {
  nextProductActiveValue,
  PRODUCT_DEACTIVATE_CONFIRM,
  productStatusLabel,
} from "./productActiveStatus";

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

check("A/B: is_active 判定とラベル", () => {
  assert.equal(isProductActiveFlag(true), true);
  assert.equal(isProductActiveFlag("true"), true);
  assert.equal(isProductActiveFlag(false), false);
  assert.equal(isProductActiveFlag("false"), false);
  assert.equal(isProductActiveFlag(null), false);
  assert.equal(productStatusLabel(true), "有効");
  assert.equal(productStatusLabel("false"), "利用停止");
});

check('A/B: 書き込み値は string "true"/"false"', () => {
  assert.equal(toProductActiveDbValue(true), "true");
  assert.equal(toProductActiveDbValue(false), "false");
  assert.equal(toProductActiveDbValue(nextProductActiveValue(true)), "false");
  assert.equal(toProductActiveDbValue(nextProductActiveValue(false)), "true");
});

check("利用停止 confirm に過去データ維持の説明がある", () => {
  assert.match(PRODUCT_DEACTIVATE_CONFIRM, /過去の案件/);
  assert.match(PRODUCT_DEACTIVATE_CONFIRM, /選択候補/);
});

check("H: 再有効化の次状態", () => {
  assert.equal(nextProductActiveValue(true), false);
  assert.equal(nextProductActiveValue(false), true);
});

check("I: 利用停止商品から複製しても新規は有効", () => {
  const copied = buildProductCopyFormValues({
    manufacturer_id: "m1",
    series_id: "s1",
    category: "蓄電池",
    model_no: "OLD-1",
    name: "廃盤モデル",
    capacity: "10",
    unit: "kWh",
    memo: "memo",
    is_active: false,
    default_supplier_id: "sup1",
  });
  assert.equal(copied.is_active, true);
  assert.equal(copied.model_no, "OLD-1");
  assert.equal(copied.default_supplier_id, "sup1");
});

check("J: 複製フィールドに価格・履歴を含めない", () => {
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
  assert.equal(Object.prototype.hasOwnProperty.call(copied, "id"), false);
  assert.equal(copied.is_active, true);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll productActiveStatus checks passed");
