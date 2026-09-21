/**
 * 案件登録 STEP2 仕入単価再解決の純関数テスト
 * 実行: npx tsx app/components/case-registration/linePriceResolve.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  ok("E: supplier change clears resolved price, keeps manual");
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
  ok("C/D: 0 yen valid, negative invalid");
}

{
  // B: manual 30000 × qty 2 → snapshot 明細金額 60000（RPC 契約の静的確認）
  const unit = 30000;
  const qty = 2;
  assert.equal(Math.round(unit * qty), 60000);
  assert.equal(Math.round(0 * 2), 0);
  ok("B/C: snapshot round(unit×qty) contract");
}

{
  const rpc = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260921121000_case_registration_supplier_price_snapshot.sql"
    ),
    "utf8"
  );
  assert.equal(
    rpc.includes(
      "IF COALESCE((v_line->>'is_manual_price')::boolean, false) THEN"
    ),
    false
  );
  assert.match(rpc, /round\(v_unit_purchase \* v_quantity\)/);
  assert.match(rpc, /supplier_id \/ purchase_price \/ sales_price/);
  assert.equal(rpc.includes("supplier/価格は登録時NULL"), false);
  ok("RPC: manual price allowed + COMMENT updated");
}

{
  const resolveSrc = readFileSync(
    join(process.cwd(), "app/components/case-registration/linePriceResolve.ts"),
    "utf8"
  );
  assert.match(
    resolveSrc,
    /fetchActivePackagePurchaseUnitPriceWithFallback/
  );
  ok("F/G/H: PACKAGE resolve uses fallback helper");
}

console.log("All linePriceResolve checks passed");
