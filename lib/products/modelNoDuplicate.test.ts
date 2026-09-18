/**
 * Run: npx tsx lib/products/modelNoDuplicate.test.ts
 */
import assert from "node:assert/strict";

import { DUPLICATE_MODEL_NO_WARNING } from "@/app/components/masters/searchableSelect";
import { toProductActiveDbValue } from "@/lib/products/productActiveContract";

import { hasModelNoDuplicateHits } from "./modelNoDuplicate";

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

check("A/B: 同型番ヒットあり → Warning対象", () => {
  assert.equal(
    hasModelNoDuplicateHits([
      { id: "1", name: "A", category: "蓄電池", model_no: "X" },
      { id: "2", name: "B", category: "セット商品", model_no: "X" },
    ]),
    true
  );
  assert.match(DUPLICATE_MODEL_NO_WARNING, /それでも登録しますか/);
});

check("C: inactive同型番もヒット（登録はUIで許可）", () => {
  assert.equal(
    hasModelNoDuplicateHits([
      {
        id: "old",
        name: "廃盤",
        category: "蓄電池",
        model_no: "ABC123",
        is_active: "false",
      },
    ]),
    true
  );
});

check("空配列はヒットなし", () => {
  assert.equal(hasModelNoDuplicateHits([]), false);
  assert.equal(hasModelNoDuplicateHits(null), false);
});

check("F: 価格はproduct_id単位（書き込み契約はstring）", () => {
  assert.equal(toProductActiveDbValue(true), "true");
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll modelNoDuplicate checks passed");
