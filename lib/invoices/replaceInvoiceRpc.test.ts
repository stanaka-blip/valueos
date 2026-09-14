import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914150000_replace_invoice_rpc.sql"),
  "utf8"
);

assert.match(sql, /CREATE OR REPLACE FUNCTION public\.replace_invoice\(payload jsonb\)/);
assert.match(sql, /DELETE FROM public\.invoice_line_items WHERE invoice_id/);
assert.match(sql, /status.*取消/);
assert.match(sql, /'ok', true/);
assert.match(sql, /'ok', false/);
assert.doesNotMatch(sql, /CREATE TABLE/);
console.log("replaceInvoiceRpc: ok");
