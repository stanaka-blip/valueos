#!/usr/bin/env node
/**
 * PR27 受注日基準ダッシュボード受入データ
 *
 * 前提: cases.order_received_date マイグレーション適用済み
 *
 * Usage:
 *   node scripts/seed-dashboard-order-received-acceptance.mjs
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
const TAG = "DASH-ORD";

async function createCase({
  key,
  customerName,
  orderReceivedDate,
  productCreatedAt,
  sales = 100000,
  profit = 30000,
  status = "受付済",
}) {
  const case_no = `VE-${TAG}-${key}-${Date.now().toString().slice(-6)}`;
  const { data: created, error } = await sb
    .from("cases")
    .insert({
      case_no,
      dealer_id: DEALER_ID,
      customer_name: customerName,
      order_type: "部材のみ発注",
      status,
      department: "営業",
      assigned_user: "受入テスト",
      memo: `${TAG} ${key}`,
      order_received_date: orderReceivedDate,
      desired_delivery_date: "2026-07-31",
    })
    .select("id, case_no, order_received_date")
    .single();

  if (error || !created) {
    throw new Error(`case failed (${key}): ${error?.message}`);
  }

  // created_at を直接指定できない場合があるため、通常 insert 後に注記のみ
  const { error: pErr } = await sb.from("case_products").insert({
    case_id: created.id,
    quantity: 1,
    sales_price: sales,
    purchase_price: sales - profit,
    gross_profit: profit,
    memo: `${TAG} product created_at想定=${productCreatedAt}`,
  });
  if (pErr) throw new Error(`product failed (${key}): ${pErr.message}`);

  return {
    key,
    case_id: created.id,
    case_no: created.case_no,
    order_received_date: created.order_received_date,
    product_created_at_note: productCreatedAt,
    sales,
    profit,
  };
}

const defs = [
  {
    key: "JUN-RECV-JUL-PRODUCT",
    customerName: "【DASH】受注6/30・明細7/2",
    orderReceivedDate: "2026-06-30",
    productCreatedAt: "2026-07-02",
  },
  {
    key: "JUL-RECV",
    customerName: "【DASH】受注7/1",
    orderReceivedDate: "2026-07-01",
    productCreatedAt: "2026-07-01",
  },
  {
    key: "CANCELLED",
    customerName: "【DASH】キャンセル（集計外）",
    orderReceivedDate: "2026-07-10",
    productCreatedAt: "2026-07-10",
    status: "キャンセル",
  },
];

const results = [];
for (const def of defs) {
  const row = await createCase(def);
  results.push(row);
  console.log("ok ", row.case_no, row.order_received_date, def.customerName);
}

mkdirSync(join(root, "tmp"), { recursive: true });
const out = join(root, "tmp/dashboard-order-received-acceptance.json");
writeFileSync(
  out,
  JSON.stringify({ created_at: new Date().toISOString(), cases: results }, null, 2)
);
console.log("wrote", out);
