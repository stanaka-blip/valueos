/**
 * PR-C: 案件詳細 商品追加UI 振る舞いテスト（DB書込なし）
 * 実行: npx tsx scripts/pr-case-detail-product-add-ui-behavior.mts
 */
import assert from "node:assert/strict";

import { resolveCaseDetailTabId } from "../app/cases/[id]/caseDetailTabs.ts";
import { caseLineFingerprint, createIdempotencyKey } from "../app/cases/[id]/submitCaseLine.ts";
import type { LineDraft } from "../app/components/case-registration/types.ts";
import { validateStep2 } from "../app/components/case-registration/validation.ts";

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

function line(partial: Partial<LineDraft> & Pick<LineDraft, "local_id">): LineDraft {
  return {
    local_id: partial.local_id,
    line_type: partial.line_type ?? "PRODUCT",
    product_id: partial.product_id ?? "",
    package_id: partial.package_id ?? "",
    quantity: partial.quantity ?? "1",
    memo: partial.memo ?? "",
    display_name: partial.display_name ?? "",
  };
}

check("fingerprint changes with quantity", () => {
  const base = {
    line_type: "PRODUCT" as const,
    product_id: "11111111-1111-4111-8111-111111111111",
    package_id: "",
    quantity: "1",
  };
  assert.notEqual(
    caseLineFingerprint(base),
    caseLineFingerprint({ ...base, quantity: "2" })
  );
});

check("PRODUCT fingerprint ignores package_id", () => {
  const a = caseLineFingerprint({
    line_type: "PRODUCT",
    product_id: "11111111-1111-4111-8111-111111111111",
    package_id: "",
    quantity: "1",
  });
  const b = caseLineFingerprint({
    line_type: "PRODUCT",
    product_id: "11111111-1111-4111-8111-111111111111",
    package_id: "22222222-2222-4222-8222-222222222222",
    quantity: "1",
  });
  assert.equal(a, b);
});

check("PACKAGE fingerprint ignores product_id", () => {
  const a = caseLineFingerprint({
    line_type: "PACKAGE",
    product_id: "",
    package_id: "22222222-2222-4222-8222-222222222222",
    quantity: "1",
  });
  const b = caseLineFingerprint({
    line_type: "PACKAGE",
    product_id: "11111111-1111-4111-8111-111111111111",
    package_id: "22222222-2222-4222-8222-222222222222",
    quantity: "1",
  });
  assert.equal(a, b);
});

check("createIdempotencyKey returns UUID-like values", () => {
  const a = createIdempotencyKey();
  const b = createIdempotencyKey();
  assert.match(
    a,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  assert.notEqual(a, b);
});

check("quantity boundaries via validateStep2", () => {
  const cases: Array<{ q: string; ok: boolean }> = [
    { q: "1", ok: true },
    { q: "9999", ok: true },
    { q: "0", ok: false },
    { q: "-1", ok: false },
    { q: "1.5", ok: false },
    { q: "10000", ok: false },
    { q: "", ok: false },
  ];
  for (const c of cases) {
    const result = validateStep2([
      line({
        local_id: "t",
        line_type: "PRODUCT",
        product_id: "11111111-1111-4111-8111-111111111111",
        quantity: c.q,
      }),
    ]);
    assert.equal(result.ok, c.ok, `quantity "${c.q}"`);
  }
});

check("PRODUCT/PACKAGE master required", () => {
  assert.equal(
    validateStep2([
      line({ local_id: "t", line_type: "PRODUCT", product_id: "", quantity: "1" }),
    ]).ok,
    false
  );
  assert.equal(
    validateStep2([
      line({ local_id: "t", line_type: "PACKAGE", package_id: "", quantity: "1" }),
    ]).ok,
    false
  );
});

check("resolveCaseDetailTabId", () => {
  assert.equal(resolveCaseDetailTabId("products"), "products");
  assert.equal(resolveCaseDetailTabId("basic"), "basic");
  assert.equal(resolveCaseDetailTabId("nope"), "basic");
  assert.equal(resolveCaseDetailTabId(undefined), "basic");
  assert.equal(resolveCaseDetailTabId(null), "basic");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll behavior checks passed");
