#!/usr/bin/env node
/**
 * PR26 入金管理 受入テスト用データシード
 *
 * Usage:
 *   node scripts/seed-payment-acceptance-cases.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const DEALER_ID = "d81e3b2f-7e19-468b-a74e-070de6216d4b";
const TAG = "PAY-ACCEPT";

function caseNo(suffix) {
  return `VE-PAY-${suffix}-${Date.now().toString().slice(-6)}`;
}

async function insertPayment(row) {
  const extended = {
    case_id: row.case_id,
    invoice_id: row.invoice_id,
    payment_date: row.payment_date,
    payment_amount: row.payment_amount,
    status: row.status,
    memo: row.memo,
    payment_method: row.payment_method ?? "銀行振込",
    payer_name: row.payer_name ?? null,
    bank_account: row.bank_account ?? null,
  };

  let { error } = await sb.from("payments").insert(extended);
  if (
    error &&
    /payment_method|payer_name|bank_account|schema cache/i.test(error.message)
  ) {
    const base = {
      case_id: row.case_id,
      invoice_id: row.invoice_id,
      payment_date: row.payment_date,
      payment_amount: row.payment_amount,
      status: row.status,
      memo: row.memo,
    };
    ({ error } = await sb.from("payments").insert(base));
  }
  if (error) throw new Error(`payment insert failed: ${error.message}`);
}

async function createCase({
  key,
  customerName,
  settlementType = "売掛",
  depositAmount = null,
  invoiceAmount = 100000,
  dueDate = "2026-08-31",
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

  const { error: stError } = await sb.from("case_settlements").upsert(
    {
      case_id: created.id,
      settlement_type: settlementType,
      fee_amount: 0,
      deposit_amount: depositAmount,
      memo: `${TAG} ${key}`,
    },
    { onConflict: "case_id" }
  );
  if (stError) {
    throw new Error(`settlement failed (${key}): ${stError.message}`);
  }

  const invoice_no = `INV-${TAG}-${key}-${Date.now().toString().slice(-4)}`;
  const { data: invRow, error: invError } = await sb
    .from("invoices")
    .insert({
      case_id: created.id,
      invoice_no,
      invoice_date: "2026-07-21",
      due_date: dueDate,
      invoice_amount: invoiceAmount,
      status: "請求済",
      memo: `${TAG} invoice`,
    })
    .select("id,invoice_no")
    .single();

  if (invError || !invRow) {
    throw new Error(`invoice failed (${key}): ${invError?.message}`);
  }

  for (const [j, p] of payments.entries()) {
    await insertPayment({
      case_id: created.id,
      invoice_id: invRow.id,
      payment_date: p.payment_date || "2026-07-22",
      payment_amount: p.payment_amount,
      status: p.status ?? "入金確認済",
      memo: p.memo || `${TAG} payment ${j + 1}`,
      payment_method: p.payment_method,
      payer_name: p.payer_name,
      bank_account: p.bank_account,
    });
  }

  return {
    key,
    case_id: created.id,
    case_no: created.case_no,
    customer_name: created.customer_name,
    settlement_type: settlementType,
    invoice_id: invRow.id,
    invoice_no: invRow.invoice_no,
    invoice_amount: invoiceAmount,
    due_date: dueDate,
    expected_status: null,
  };
}

const defs = [
  {
    key: "01-UNPAID",
    customerName: "【PAY】未入金",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [],
    expected_status: "未入金",
  },
  {
    key: "02-PARTIAL",
    customerName: "【PAY】一部入金",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [
      {
        payment_amount: 40000,
        status: "入金確認済",
        payer_name: "イチブニュウキン",
        bank_account: "テスト銀行 普通 1111111",
      },
    ],
    expected_status: "一部入金",
  },
  {
    key: "03-FULL",
    customerName: "【PAY】満額入金",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [
      {
        payment_amount: 100000,
        status: "入金確認済",
        payer_name: "マンガク",
      },
    ],
    expected_status: "入金済",
  },
  {
    key: "04-MULTI",
    customerName: "【PAY】複数回入金",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [
      { payment_amount: 30000, status: "入金確認済", memo: `${TAG} multi-1` },
      { payment_amount: 70000, status: "入金確認済", memo: `${TAG} multi-2` },
    ],
    expected_status: "入金済",
  },
  {
    key: "05-OVERPAY",
    customerName: "【PAY】過入金",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ payment_amount: 120000, status: "入金確認済" }],
    expected_status: "入金済（過入金警告）",
  },
  {
    key: "06-PENDING",
    customerName: "【PAY】確認待ち",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ payment_amount: 100000, status: "確認待ち" }],
    expected_status: "未入金（確認待ちは集計外）",
  },
  {
    key: "07-CANCEL",
    customerName: "【PAY】取消",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [
      { payment_amount: 100000, status: "取消" },
      { payment_amount: 40000, status: "入金確認済" },
    ],
    expected_status: "一部入金（取消は集計外）",
  },
  {
    key: "08-OVERDUE",
    customerName: "【PAY】期限超過",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-07-20",
    payments: [],
    expected_status: "期限超過",
  },
  {
    key: "09-DUE-TODAY",
    customerName: "【PAY】期限当日",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: new Date().toISOString().slice(0, 10),
    payments: [],
    expected_status: "未入金（当日は遅延なし）",
  },
  {
    key: "10-PREPAID-PAID",
    customerName: "【PAY】前金・満額入金→発注可",
    settlementType: "前金",
    depositAmount: 100000,
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ payment_amount: 100000, status: "入金確認済" }],
    expected_status: "入金済 / canOrder=true",
  },
  {
    key: "11-MIX-A",
    customerName: "【PAY】混在チェックA",
    settlementType: "売掛",
    invoiceAmount: 100000,
    dueDate: "2026-08-31",
    payments: [{ payment_amount: 100000, status: "入金確認済" }],
    expected_status: "入金済（Bと混ざらない）",
  },
  {
    key: "12-MIX-B",
    customerName: "【PAY】混在チェックB",
    settlementType: "売掛",
    invoiceAmount: 200000,
    dueDate: "2026-08-31",
    payments: [{ payment_amount: 50000, status: "入金確認済" }],
    expected_status: "一部入金（Aと混ざらない）",
  },
];

const results = [];
for (const def of defs) {
  const row = await createCase(def);
  row.expected_status = def.expected_status;
  results.push(row);
  console.log(
    `ok  ${def.key} case=${row.case_no} invoice=${row.invoice_no} => ${def.expected_status}`
  );
}

mkdirSync(join(root, "tmp"), { recursive: true });
const outPath = join(root, "tmp/payment-acceptance-cases.json");
writeFileSync(
  outPath,
  JSON.stringify({ created_at: new Date().toISOString(), cases: results }, null, 2)
);
console.log("wrote", outPath);
