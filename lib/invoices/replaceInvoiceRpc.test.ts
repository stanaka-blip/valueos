import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const legacy = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914150000_replace_invoice_rpc.sql"),
  "utf8",
);
const fixed = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261002100000_case_has_locking_dealer_settlement_helper.sql",
  ),
  "utf8",
);

assert.match(legacy, /CREATE OR REPLACE FUNCTION public\.replace_invoice\(payload jsonb\)/);
assert.match(legacy, /DELETE FROM public\.invoice_line_items WHERE invoice_id = v_invoice_id/);
assert.match(legacy, /取消済の請求は編集できません/);
assert.match(legacy, /'ok', true/);
assert.match(legacy, /'ok', false/);
assert.doesNotMatch(legacy, /CREATE TABLE/);

// Current behavior after follow-up migration
assert.match(fixed, /case_has_locking_dealer_settlement/);
assert.match(
  fixed,
  /確定済みまたは支払済の仕切があるため、請求額を変更できません/,
);
assert.match(fixed, /v_invoice_amount IS DISTINCT FROM v_original_amount/);
console.log("replaceInvoiceRpc: ok");
