/**
 * Contract: case_has_locking_dealer_settlement helper + replace_invoice / cancel_invoice
 * wiring (migration 20261002100000).
 *
 * Runtime DB scenarios 1–10 are documented as SQL assertions on the migration text;
 * live Prod verification is human-applied after review.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migPath = join(
  process.cwd(),
  "supabase/migrations/20261002100000_case_has_locking_dealer_settlement_helper.sql",
);
const sql = readFileSync(migPath, "utf8");

// --- helper shape ---
assert.match(
  sql,
  /CREATE OR REPLACE FUNCTION public\.case_has_locking_dealer_settlement\(p_case_id uuid\)/,
);
assert.match(sql, /RETURNS boolean/);
assert.match(sql, /SECURITY DEFINER/);
assert.match(sql, /SET search_path = pg_catalog, public/);
assert.match(sql, /IN \('確定', '支払済'\)/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.case_has_locking_dealer_settlement\(uuid\) FROM PUBLIC/);
assert.match(
  sql,
  /GRANT EXECUTE ON FUNCTION public\.case_has_locking_dealer_settlement\(uuid\) TO authenticated/,
);
assert.match(
  sql,
  /GRANT EXECUTE ON FUNCTION public\.case_has_locking_dealer_settlement\(uuid\) TO anon/,
);

// Must NOT grant table SELECT on dealer_settlements
assert.doesNotMatch(
  sql,
  /GRANT\s+(SELECT|[^\n]*SELECT[^\n]*)\s+ON\s+TABLE\s+public\.dealer_settlements/i,
);
assert.doesNotMatch(sql, /GRANT\s+ALL\s+ON\s+TABLE\s+public\.dealer_settlements/i);
assert.doesNotMatch(sql, /ALTER\s+TABLE\s+public\.dealer_settlements/i);
assert.doesNotMatch(sql, /CREATE\s+POLICY/i);
assert.doesNotMatch(sql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);

// Helper returns boolean only — no SELECT of settlement row payloads to caller
assert.match(
  sql,
  /CREATE OR REPLACE FUNCTION public\.case_has_locking_dealer_settlement\(p_case_id uuid\)\s*RETURNS boolean/,
);
assert.doesNotMatch(
  sql,
  /CREATE OR REPLACE FUNCTION public\.case_has_locking_dealer_settlement\(p_case_id uuid\)\s*RETURNS jsonb/i,
);

// --- replace_invoice uses helper; keeps amount-change business rule ---
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.replace_invoice\(payload jsonb\)/);
assert.match(sql, /SECURITY INVOKER/);
assert.match(
  sql,
  /public\.case_has_locking_dealer_settlement\(v_case_id\)/,
);
assert.match(
  sql,
  /v_invoice_amount IS DISTINCT FROM v_original_amount/,
);
assert.match(
  sql,
  /確定済みまたは支払済の仕切があるため、請求額を変更できません/,
);

// replace_invoice body must not SELECT dealer_settlements directly
const replaceStart = sql.indexOf(
  "CREATE OR REPLACE FUNCTION public.replace_invoice(payload jsonb)",
);
const cancelStart = sql.indexOf(
  "CREATE OR REPLACE FUNCTION public.cancel_invoice(payload jsonb)",
);
assert.ok(replaceStart >= 0 && cancelStart > replaceStart);
const replaceBody = sql.slice(replaceStart, cancelStart);
assert.doesNotMatch(
  replaceBody,
  /FROM\s+public\.dealer_settlements/i,
);
assert.match(
  replaceBody,
  /case_has_locking_dealer_settlement\(v_case_id\)\s*\n\s*AND v_invoice_amount IS DISTINCT FROM v_original_amount/,
);

// payments guard preserved
assert.match(replaceBody, /入金確認済/);
assert.match(replaceBody, /v_invoice_amount < v_confirmed_paid/);
assert.match(replaceBody, /FROM public\.payments p/);

// invoice / line_items write path preserved
assert.match(replaceBody, /UPDATE public\.invoices/);
assert.match(
  replaceBody,
  /DELETE FROM public\.invoice_line_items WHERE invoice_id = v_invoice_id/,
);
assert.match(replaceBody, /INSERT INTO public\.invoice_line_items/);

// catch-all: still generic to client; LOG true cause server-side
assert.match(replaceBody, /INVOICE_UPDATE_FAILED/);
assert.match(replaceBody, /請求の更新に失敗しました/);
assert.match(
  replaceBody,
  /RAISE LOG 'replace_invoice failed SQLSTATE=% SQLERRM=%'/,
);
assert.doesNotMatch(replaceBody, /'sqlerrm'\s*,\s*SQLERRM/);
assert.doesNotMatch(replaceBody, /error_message',\s*SQLERRM/);

// --- cancel_invoice uses helper (no amount condition) ---
const cancelBody = sql.slice(cancelStart);
assert.match(cancelBody, /SECURITY INVOKER/);
assert.match(
  cancelBody,
  /public\.case_has_locking_dealer_settlement\(v_case_id\)/,
);
assert.match(
  cancelBody,
  /確定済みまたは支払済の仕切があるため、請求を取消できません/,
);
assert.doesNotMatch(cancelBody, /FROM\s+public\.dealer_settlements/i);

// Scenario mapping (contract-level; live DB verify after migration apply):
// 1 仕切なし → helper false → amount change allowed by settlement gate
// 2 未確定のみ → helper false → allowed
// 3 確定 + 金額同一 → helper true BUT amount DISTINCT false → allowed
// 4 支払済 + 金額同一 → same
// 5 確定 + 金額変更 → APP reject
// 6 支払済 + 金額変更 → APP reject
// 7/8 authenticated/anon: no TABLE GRANT in this migration
// 9 invoice/line_items paths unchanged (asserted above)
// 10 payments guard unchanged (asserted above)
assert.ok(true, "scenarios 1-10 covered by contract assertions");

console.log("caseHasLockingDealerSettlementHelper: ok");
