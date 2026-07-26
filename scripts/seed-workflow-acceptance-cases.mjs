#!/usr/bin/env node
/**
 * WorkflowEngine 受入テスト用案件シード
 *
 * Usage:
 *   node scripts/seed-workflow-acceptance-cases.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const DEALER_ID = "d81e3b2f-7e19-468b-a74e-070de6216d4b"; // あ
const SUPPLIER_ID = "d1544373-c725-47f3-a7ad-9d734c49bf78"; // novis
const TAG = "WF-ACCEPT";

function workflowMemo(meta) {
  return `__workflow_v1__:${JSON.stringify(meta)}`;
}

function caseNo(suffix) {
  return `VE-WF-${suffix}-${Date.now().toString().slice(-6)}`;
}

async function createCase({
  key,
  customerName,
  settlementType,
  depositAmount = null,
  memoMeta = null,
  humanMemo = "",
  orders = [],
  invoices = [],
  payments = [],
}) {
  const case_no = caseNo(key);
  const { data: created, error: caseError } = await sb
    .from("cases")
    .insert({
      case_no,
      dealer_id: DEALER_ID,
      customer_name: customerName,
      order_type: "部材のみ発注",
      status: "新規受付",
      department: "営業",
      assigned_user: "受入テスト",
      memo: `${TAG} ${key}`,
      desired_delivery_date: "2026-07-31",
    })
    .select("id,case_no,customer_name")
    .single();

  if (caseError || !created) {
    throw new Error(`case create failed (${key}): ${caseError?.message}`);
  }

  const memo = memoMeta
    ? [humanMemo, workflowMemo(memoMeta)].filter(Boolean).join("\n")
    : humanMemo || null;

  const { error: stError } = await sb.from("case_settlements").upsert(
    {
      case_id: created.id,
      settlement_type: settlementType,
      fee_amount: 0,
      deposit_amount: depositAmount,
      memo,
    },
    { onConflict: "case_id" }
  );
  if (stError) {
    throw new Error(`settlement failed (${key}): ${stError.message}`);
  }

  for (const [i, o] of orders.entries()) {
    const { error } = await sb.from("orders").insert({
      case_id: created.id,
      supplier_id: SUPPLIER_ID,
      order_no: `PO-${TAG}-${key}-${i + 1}-${Date.now().toString().slice(-4)}`,
      order_date: "2026-07-20",
      expected_delivery_date: "2026-07-31",
      delivered_date: o.delivered_date ?? null,
      order_amount: o.order_amount ?? 100000,
      status: o.status,
      memo: `${TAG} order`,
    });
    if (error) throw new Error(`order failed (${key}): ${error.message}`);
  }

  for (const [i, inv] of invoices.entries()) {
    const { data: invRow, error } = await sb
      .from("invoices")
      .insert({
        case_id: created.id,
        invoice_no: `INV-${TAG}-${key}-${i + 1}-${Date.now().toString().slice(-4)}`,
        invoice_date: "2026-07-21",
        due_date: "2026-08-31",
        invoice_amount: inv.invoice_amount ?? 100000,
        status: inv.status ?? "請求済",
        memo: `${TAG} invoice`,
      })
      .select("id")
      .single();
    if (error || !invRow) {
      throw new Error(`invoice failed (${key}): ${error?.message}`);
    }

    for (const [j, p] of (inv.payments || []).entries()) {
      const { error: pErr } = await sb.from("payments").insert({
        case_id: created.id,
        invoice_id: invRow.id,
        payment_date: "2026-07-22",
        payment_amount: p.payment_amount,
        status: p.status ?? "入金確認済",
        memo: `${TAG} payment ${j + 1}`,
      });
      if (pErr) throw new Error(`payment failed (${key}): ${pErr.message}`);
    }
  }

  for (const p of payments) {
    const { error } = await sb.from("payments").insert({
      case_id: created.id,
      invoice_id: null,
      payment_date: "2026-07-22",
      payment_amount: p.payment_amount,
      status: p.status ?? "入金確認済",
      memo: `${TAG} payment`,
    });
    if (error) throw new Error(`bare payment failed (${key}): ${error.message}`);
  }

  return {
    key,
    id: created.id,
    case_no: created.case_no,
    customer_name: created.customer_name,
    settlement_type: settlementType,
  };
}

const defs = [
  {
    key: "01-PREPAID-UNPAID",
    customerName: "【WF】前金・未入金",
    settlementType: "前金",
    depositAmount: 100000,
    humanMemo: "受入① 前金未入金",
  },
  {
    key: "02-PREPAID-PAID",
    customerName: "【WF】前金・入金済",
    settlementType: "前金",
    depositAmount: 100000,
    humanMemo: "受入② 前金入金済",
    invoices: [
      {
        invoice_amount: 100000,
        status: "請求済",
        payments: [{ payment_amount: 100000, status: "入金確認済" }],
      },
    ],
  },
  {
    key: "03-LOAN-UNAPPROVED",
    customerName: "【WF】ローン・未承認",
    settlementType: "三社間決済",
    humanMemo: "受入③ ローン未承認",
    memoMeta: { loan_status: "申請中", card_status: null, construction_completed_date: null },
  },
  {
    key: "04-LOAN-APPROVED",
    customerName: "【WF】ローン・承認済",
    settlementType: "三社間決済",
    humanMemo: "受入④ ローン承認済・完工前",
    memoMeta: { loan_status: "承認済", card_status: null, construction_completed_date: null },
  },
  {
    key: "05-LOAN-COMPLETED",
    customerName: "【WF】ローン・完工済",
    settlementType: "三社間決済",
    humanMemo: "受入⑤ ローン承認済・完工済",
    memoMeta: {
      loan_status: "承認済",
      card_status: null,
      construction_completed_date: "2026-07-20",
    },
  },
  {
    key: "06-CREDIT-UNDELIVERED",
    customerName: "【WF】売掛・未納品",
    settlementType: "掛売",
    humanMemo: "受入⑥ 売掛・未納品",
    orders: [{ status: "発注済", delivered_date: null, order_amount: 200000 }],
  },
  {
    key: "07-CREDIT-DELIVERED",
    customerName: "【WF】売掛・全納品",
    settlementType: "掛売",
    humanMemo: "受入⑦ 売掛・全納品",
    orders: [
      { status: "納品済", delivered_date: "2026-07-10", order_amount: 150000 },
      { status: "納品済", delivered_date: "2026-07-25", order_amount: 150000 },
    ],
  },
  {
    key: "08-CARD-UNPAID",
    customerName: "【WF】カード・未決済",
    settlementType: "カード",
    humanMemo: "受入⑧ カード未決済",
    memoMeta: { loan_status: null, card_status: "未決済", construction_completed_date: null },
  },
  {
    key: "09-CARD-SUCCESS",
    customerName: "【WF】カード・決済成功",
    settlementType: "カード",
    humanMemo: "受入⑨ カード決済成功",
    memoMeta: { loan_status: null, card_status: "決済成功", construction_completed_date: null },
  },
];

const results = [];
for (const def of defs) {
  const row = await createCase(def);
  results.push(row);
  console.log("created", row.key, row.case_no, row.id);
}

const outPath = join(root, "tmp/workflow-acceptance-cases.json");
writeFileSync(outPath, JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2));
console.log("wrote", outPath);
console.log(JSON.stringify(results, null, 2));
