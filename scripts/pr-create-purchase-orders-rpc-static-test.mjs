/**
 * create_purchase_orders RPC — 静的契約テスト（本番DB不使用）
 * Run: node --test scripts/pr-create-purchase-orders-rpc-static-test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const ORDER_TARGETS = join(ROOT, "app/cases/[id]/orders/orderTargets.ts");
const SUBMIT_PO = join(
  ROOT,
  "app/cases/[id]/orders/new/submitPurchaseOrders.ts"
);
const PURCHASE_ORDERS_API = join(
  ROOT,
  "app/api/cases/[id]/purchase-orders/route.ts"
);
const CREATE_PO_CORE = join(
  ROOT,
  "lib/purchaseOrders/createPurchaseOrdersCore.ts"
);
const DEALER_DIR_MARKER = "app/dealer/";

const sql = readFileSync(MIG, "utf8");
const rollback = readFileSync(ROLLBACK, "utf8");
const types = readFileSync(TYPES, "utf8");
const orderNew = readFileSync(ORDER_NEW, "utf8");
const orderTargets = readFileSync(ORDER_TARGETS, "utf8");
const submitPo = readFileSync(SUBMIT_PO, "utf8");
const purchaseOrdersApi = readFileSync(PURCHASE_ORDERS_API, "utf8");
const createPoCore = readFileSync(CREATE_PO_CORE, "utf8");

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

describe("rollback / types / admin order UI+API path (PR #62)", () => {
  it("rollback drops function and ledger only", () => {
    assert.match(rollback, /DROP FUNCTION IF EXISTS public\.create_purchase_orders\(jsonb\)/);
    assert.match(rollback, /DROP TABLE IF EXISTS public\.purchase_order_create_requests/);
  });

  it("database.types includes create_purchase_orders", () => {
    assert.match(types, /create_purchase_orders:\s*\{/);
  });

  it("admin order UI uses per-target supplier split and purchase-orders API", () => {
    // 旧ヘッダー共通仕入先 / ディーラー既定 / 発注区分は廃止
    assert.doesNotMatch(orderNew, /name="supplier_id"/);
    assert.doesNotMatch(orderNew, /dealers \(\s*default_supplier_id/);
    assert.doesNotMatch(orderNew, /発注区分/);

    // 新UI: 行/パッケージ単位ターゲット + API 経由保存
    assert.match(orderNew, /buildOrderTargets/);
    assert.match(orderNew, /submitPurchaseOrders/);
    assert.match(orderTargets, /groupLinesBySupplier|groupTargetsBySupplier/);
    assert.match(orderTargets, /default_supplier_id/);
    assert.match(submitPo, /\/api\/cases\/\$\{options\.caseId\}\/purchase-orders/);
    assert.match(submitPo, /Idempotency-Key/);

    // UI → API → RPC 経路ファイルが存在し、RPC を呼ぶ
    assert.ok(existsSync(PURCHASE_ORDERS_API), "purchase-orders API route");
    assert.ok(existsSync(CREATE_PO_CORE), "createPurchaseOrdersCore");
    assert.match(purchaseOrdersApi, /createPurchaseOrdersByCaseId/);
    assert.match(createPoCore, /\.rpc\(\s*"create_purchase_orders"/);
  });

  it("does not touch dealer paths in changed surface (static marker)", () => {
    assert.ok(!sql.includes(DEALER_DIR_MARKER));
    assert.ok(!rollback.includes(DEALER_DIR_MARKER));
  });
});
