/**
 * 案件登録 STEP2 仕入単価再解決の純関数テスト
 * 実行: npx tsx app/components/case-registration/linePriceResolve.test.ts
 */
import assert from "node:assert/strict";

import {
  emptyLinePriceFields,
  formatYenInput,
  parseOptionalNonNegativePrice,
  patchOnSupplierChange,
} from "./linePriceResolve";

function ok(name: string) {
  console.log(`OK ${name}`);
}

{
  const e = emptyLinePriceFields();
  assert.equal(e.purchase_price, "");
  assert.equal(e.purchase_price_is_manual, false);
  ok("empty price fields");
}

{
  assert.equal(formatYenInput(56000), "56000");
  assert.equal(formatYenInput(0), "0");
  ok("format yen");
}

{
  const cleared = patchOnSupplierChange({
    purchase_price_is_manual: false,
    purchase_price: "56000",
  });
  assert.equal(cleared.purchase_price, "");
  assert.equal(cleared.purchase_price_is_manual, false);

  const kept = patchOnSupplierChange({
    purchase_price_is_manual: true,
    purchase_price: "12345",
  });
  assert.equal(kept.purchase_price, "12345");
  assert.equal(kept.purchase_price_is_manual, true);
  ok("A/B: supplier change clears resolved price, keeps manual");
}

{
  assert.deepEqual(parseOptionalNonNegativePrice(""), { ok: true, value: null });
  assert.deepEqual(parseOptionalNonNegativePrice("0"), { ok: true, value: 0 });
  assert.deepEqual(parseOptionalNonNegativePrice("56000"), {
    ok: true,
    value: 56000,
  });
  assert.equal(parseOptionalNonNegativePrice("-1").ok, false);
  assert.equal(parseOptionalNonNegativePrice("abc").ok, false);
  ok("C: 0 yen valid, negative invalid");
}

console.log("All linePriceResolve checks passed");
