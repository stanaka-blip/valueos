import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914150000_replace_invoice_rpc.sql"),
  "utf8",
);

const cancelBtn = readFileSync(
  join(process.cwd(), "app/invoices/[id]/InvoiceCancelButton.tsx"),
  "utf8",
);
const paymentActions = readFileSync(
  join(process.cwd(), "app/invoices/[id]/PaymentRowActions.tsx"),
  "utf8",
);
const paymentEdit = readFileSync(
  join(
    process.cwd(),
    "app/invoices/[id]/payments/[paymentId]/edit/page.tsx",
  ),
  "utf8",
);
const auditSql = readFileSync(
  join(
    process.cwd(),
    "supabase/audit/phase2_invoice_payment_integrity.sql",
  ),
  "utf8",
);

// --- replace_invoice ---
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.replace_invoice\(payload jsonb\)/);
assert.match(sql, /DELETE FROM public\.invoice_line_items WHERE invoice_id = v_invoice_id/);
assert.match(sql, /入金確認済/);
assert.match(sql, /確認済入金合計/);
assert.match(sql, /確定済みまたは支払済の仕切があるため、請求額を変更できません/);
assert.match(sql, /取消済の請求は編集できません/);
assert.match(sql, /'ok', true/);
assert.match(sql, /'ok', false/);
assert.match(sql, /EXCEPTION/);
assert.match(sql, /v_invoice_amount < v_confirmed_paid/);
assert.match(sql, /v_invoice_amount IS DISTINCT FROM v_original_amount/);
assert.doesNotMatch(sql, /CREATE TABLE/);
assert.doesNotMatch(sql, /ALTER TABLE/);
assert.doesNotMatch(sql, /TRUNCATE/);
assert.doesNotMatch(
  sql,
  /UPDATE\s+public\.(finance_receipts|dealer_settlements|supplier_payments|three_party_money_requests)/i,
);

// --- cancel_invoice ---
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cancel_invoice\(payload jsonb\)/);
assert.match(
  sql,
  /この請求には入金履歴があります。先に入金を取消してから、請求を取消してください。/,
);
assert.match(sql, /status = '取消'/);
assert.match(sql, /この請求は既に取消済みです/);
assert.match(sql, /確定済みまたは支払済の仕切があるため、請求を取消できません/);
assert.match(sql, /<> '取消'/);

// --- replace_payment ---
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.replace_payment\(payload jsonb\)/);
assert.match(sql, /取消済みの入金は編集できません/);
assert.match(sql, /取消済みの請求に紐づく入金は編集できません/);
assert.match(sql, /有効入金の合計が請求金額を超えます/);
assert.match(sql, /\(v_other_active \+ v_payment_amount\) > v_invoice_amount/);

// --- cancel_payment ---
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cancel_payment\(payload jsonb\)/);
assert.match(sql, /この入金は既に取消済みです/);
assert.match(sql, /status = '取消'/);

// N/O: UI must call RPC only
assert.match(cancelBtn, /\.rpc\("cancel_invoice"/);
assert.doesNotMatch(cancelBtn, /\.from\("invoices"\)\s*\.update/);
assert.match(paymentActions, /\.rpc\("cancel_payment"/);
assert.doesNotMatch(paymentActions, /\.from\("payments"\)\s*\.update/);
assert.match(paymentEdit, /\.rpc\("replace_payment"/);
assert.doesNotMatch(paymentEdit, /\.from\("payments"\)\s*\.update/);

// Audit SQL SELECT-only
assert.match(auditSql, /取消請求に有効/);
assert.match(auditSql, /過入金/);
assert.match(auditSql, /確定\/支払済/);
assert.doesNotMatch(auditSql, /^\s*(UPDATE|DELETE|INSERT|TRUNCATE)\b/im);

console.log("phase2InvoicePaymentRpcContract: ok");
