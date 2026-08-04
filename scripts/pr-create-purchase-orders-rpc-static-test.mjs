/**
 * create_purchase_orders RPC — 静的契約テスト（本番DB不使用）
 * Run: node --test scripts/pr-create-purchase-orders-rpc-static-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const MIG = join(
  ROOT,
  "supabase/migrations/20260803120000_create_purchase_orders_rpc.sql"
);
const ROLLBACK = join(
  ROOT,
  "scripts/pr-create-purchase-orders-rpc-rollback.sql"
);
const TYPES = join(ROOT, "lib/database.types.ts");
const ORDER_NEW = join(ROOT, "app/cases/[id]/orders/new/page.tsx");
const DEALER_DIR_MARKER = "app/dealer/";

const sql = readFileSync(MIG, "utf8");
const rollback = readFileSync(ROLLBACK, "utf8");
const types = readFileSync(TYPES, "utf8");
const orderNew = readFileSync(ORDER_NEW, "utf8");

describe("create_purchase_orders migration contract", () => {
  it("defines ledger table and RPC", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.purchase_order_create_requests/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_purchase_orders\(payload jsonb\)/);
    assert.match(sql, /SECURITY INVOKER/);
  });

  it("creates multiple orders atomically in one function body", () => {
    assert.match(sql, /INSERT INTO public\.orders/);
    assert.match(sql, /INSERT INTO public\.order_items/);
    assert.match(sql, /FOR v_order_idx IN/);
    assert.match(sql, /同じ仕入先の発注が重複しています/);
  });

  it("rejects missing supplier / unit price / duplicate order_no", () => {
    assert.match(sql, /仕入先を選択してください/);
    assert.match(sql, /仕入単価が未設定の明細があります/);
    assert.match(sql, /DUPLICATE_ORDER_NO/);
    assert.match(sql, /同じ発注番号がすでに登録されています/);
  });

  it("recomputes order_amount server-side", () => {
    assert.match(sql, /v_order_amount := 0/);
    assert.match(sql, /v_amount := round\(v_quantity \* v_unit_price\)/);
    assert.match(sql, /order_amount,/);
  });

  it("grants execute only to service_role", () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_purchase_orders\(jsonb\) FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_purchase_orders\(jsonb\) FROM anon/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_purchase_orders\(jsonb\) FROM authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_purchase_orders\(jsonb\) TO service_role/);
  });

  it("adds order_no unique index for concurrency safety", () => {
    assert.match(sql, /orders_order_no_unique/);
  });

  it("idempotent ledger handles conflict and replay", () => {
    assert.match(sql, /REQUEST_ID_CONFLICT/);
    assert.match(sql, /idempotent_replay/);
    assert.match(sql, /payload_hash/);
  });
});

describe("rollback / types / no UI in this PR", () => {
  it("rollback drops function and ledger only", () => {
    assert.match(rollback, /DROP FUNCTION IF EXISTS public\.create_purchase_orders\(jsonb\)/);
    assert.match(rollback, /DROP TABLE IF EXISTS public\.purchase_order_create_requests/);
  });

  it("database.types includes create_purchase_orders", () => {
    assert.match(types, /create_purchase_orders:\s*\{/);
  });

  it("does not change admin order UI in this PR", () => {
    // 旧UIの共通仕入先がまだ残っている = UI PR未着手の証
    assert.match(orderNew, /name="supplier_id"/);
    assert.match(orderNew, /dealers \(\s*default_supplier_id/);
    assert.match(orderNew, /発注区分/);
  });

  it("does not touch dealer paths in changed surface (static marker)", () => {
    assert.ok(!sql.includes(DEALER_DIR_MARKER));
    assert.ok(!rollback.includes(DEALER_DIR_MARKER));
  });
});
