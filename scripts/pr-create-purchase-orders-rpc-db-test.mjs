/**
 * create_purchase_orders 隔離DBテスト（本番DB不使用）
 * Run: node scripts/pr-create-purchase-orders-rpc-db-test.mjs
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const DB = "valueos_pr_create_purchase_orders_test";
const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function psql(sql, db = DB, role = null) {
  const args = ["-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"];
  if (role) {
    args.push("-c", `SET ROLE ${role}`);
    args.push("-c", sql);
  } else {
    args.push("-c", sql);
  }
  const out = execFileSync("sudo", args, { encoding: "utf8" }).trim();
  if (!out) return "";
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l !== "SET");
  return lines[lines.length - 1] || "";
}

function psqlFile(file, db = DB) {
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", file],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function setup() {
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${DB};`],
    { encoding: "utf8" }
  );
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${DB};`],
    { encoding: "utf8" }
  );

  psql(
    `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    `,
    "postgres"
  );

  psqlFile(join(ROOT, "scripts/fixtures/pr36-local-schema.sql"));

  // orders / order_items（本番は既存。fixture には無いため最小定義）
  psql(`
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
      supplier_id uuid REFERENCES public.suppliers(id),
      order_no text,
      order_date date,
      expected_delivery_date date,
      delivered_date date,
      order_amount numeric,
      status text,
      memo text
    );

    CREATE TABLE public.order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
      case_product_id uuid REFERENCES public.case_products(id) ON DELETE SET NULL,
      quantity numeric NOT NULL DEFAULT 1,
      unit_price numeric,
      amount numeric,
      memo text,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);

  psqlFile(
    join(ROOT, "supabase/migrations/20260803120000_create_purchase_orders_rpc.sql")
  );
  // 再実行耐性
  psqlFile(
    join(ROOT, "supabase/migrations/20260803120000_create_purchase_orders_rpc.sql")
  );

  psql(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    REVOKE ALL ON TABLE public.purchase_order_create_requests FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.purchase_order_create_requests TO service_role;
    REVOKE ALL ON FUNCTION public.create_purchase_orders(jsonb) FROM PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.create_purchase_orders(jsonb) TO service_role;
  `);

  psql(`
    INSERT INTO cases (id, case_no, dealer_id, customer_name, site_address, status)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'VE-PO-1',
      '11111111-1111-1111-1111-111111111111',
      '顧客A',
      '東京都',
      '新規受付'
    );

    INSERT INTO case_products (id, case_id, product_id, quantity, purchase_price)
    VALUES (
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '33333333-3333-3333-3333-333333333333',
      1,
      1000
    );

    INSERT INTO suppliers (id, name, is_active)
    VALUES ('22222222-2222-2222-2222-222222222223', '仕入先B', true);
  `);
}

function count(table, where = "true") {
  return Number(psql(`SELECT count(*)::int FROM ${table} WHERE ${where};`));
}

function callRpc(payload, role = "service_role") {
  const json = JSON.stringify(payload).replace(/'/g, "''");
  return psql(
    `SELECT public.create_purchase_orders('${json}'::jsonb)::text;`,
    DB,
    role
  );
}

const CASE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PRODUCT_A = "33333333-3333-3333-3333-333333333333";
const PRODUCT_B = "33333333-3333-3333-3333-333333333334";
const SUPPLIER_A = "22222222-2222-2222-2222-222222222222";
const SUPPLIER_B = "22222222-2222-2222-2222-222222222223";
const CASE_PRODUCT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function baseOrder(overrides = {}) {
  return {
    supplier_id: SUPPLIER_A,
    order_no: `PO-TEST-${randomUUID().slice(0, 8)}`,
    order_date: "2026-08-03",
    expected_delivery_date: "2026-08-10",
    delivered_date: null,
    status: "発注済",
    memo: null,
    items: [
      {
        product_id: PRODUCT_A,
        case_product_id: CASE_PRODUCT_ID,
        quantity: 2,
        unit_price: 1000,
        memo: null,
        sort_order: 0,
      },
    ],
    ...overrides,
  };
}

function basePayload(overrides = {}) {
  const { orders, ...rest } = overrides;
  return {
    request_id: randomUUID(),
    case_id: CASE_ID,
    case_status: "発注済",
    orders: orders || [baseOrder()],
    ...rest,
  };
}

try {
  setup();

  assert(
    "function exists",
    psql(`SELECT count(*) FROM pg_proc WHERE proname='create_purchase_orders';`) ===
      "1"
  );
  assert(
    "ledger exists",
    psql(
      `SELECT to_regclass('public.purchase_order_create_requests') IS NOT NULL;`
    ) === "t"
  );
  assert(
    "order_no unique index exists",
    psql(
      `SELECT count(*) FROM pg_class WHERE relname='orders_order_no_unique';`
    ) === "1"
  );

  // privileges
  {
    let anonDenied = false;
    try {
      callRpc(basePayload(), "anon");
    } catch {
      anonDenied = true;
    }
    assert("anon cannot execute", anonDenied);

    let authDenied = false;
    try {
      callRpc(basePayload(), "authenticated");
    } catch {
      authDenied = true;
    }
    assert("authenticated cannot execute", authDenied);
  }

  // 1 supplier / 1 order
  {
    const payload = basePayload();
    const res = JSON.parse(callRpc(payload));
    assert("single order ok", res.ok === true && res.orders?.length === 1);
    assert("single order amount", Number(res.orders[0].order_amount) === 2000);
    assert("orders count=1", count("orders") === 1);
    assert("items count=1", count("order_items") === 1);
    assert(
      "case status updated",
      psql(`SELECT status FROM cases WHERE id='${CASE_ID}';`) === "発注済"
    );

    // idempotent replay
    const replay = JSON.parse(callRpc(payload));
    assert(
      "idempotent replay",
      replay.ok === true &&
        replay.idempotent_replay === true &&
        replay.orders?.[0]?.id === res.orders[0].id
    );
    assert("idempotent does not duplicate", count("orders") === 1);
  }

  // multi supplier atomic create
  {
    const beforeOrders = count("orders");
    const beforeItems = count("order_items");
    const payload = basePayload({
      orders: [
        baseOrder({
          supplier_id: SUPPLIER_A,
          order_no: `PO-MULTI-A-${Date.now()}`,
          items: [
            {
              product_id: PRODUCT_A,
              case_product_id: CASE_PRODUCT_ID,
              quantity: 1,
              unit_price: 1000,
              sort_order: 0,
            },
          ],
        }),
        baseOrder({
          supplier_id: SUPPLIER_B,
          order_no: `PO-MULTI-B-${Date.now()}`,
          items: [
            {
              product_id: PRODUCT_B,
              case_product_id: null,
              quantity: 3,
              unit_price: 500,
              sort_order: 0,
            },
            {
              product_id: PRODUCT_A,
              case_product_id: null,
              quantity: 1,
              unit_price: 100,
              sort_order: 1,
            },
          ],
        }),
      ],
    });
    const res = JSON.parse(callRpc(payload));
    assert("multi order ok", res.ok === true && res.orders?.length === 2);
    assert(
      "multi amounts",
      Number(res.orders[0].order_amount) === 1000 &&
        Number(res.orders[1].order_amount) === 1600
    );
    assert("orders +2", count("orders") === beforeOrders + 2);
    assert("items +3", count("order_items") === beforeItems + 3);

    const aItems = count(
      "order_items",
      `order_id='${res.orders[0].id}'`
    );
    const bItems = count(
      "order_items",
      `order_id='${res.orders[1].id}'`
    );
    assert("items split by order", aItems === 1 && bItems === 2);
  }

  // atomic rollback when second order_no duplicates existing
  {
    const existingNo = psql(`SELECT order_no FROM orders LIMIT 1;`);
    const beforeOrders = count("orders");
    const beforeItems = count("order_items");
    const res = JSON.parse(
      callRpc(
        basePayload({
          orders: [
            baseOrder({
              supplier_id: SUPPLIER_A,
              order_no: `PO-ROLL-A-${Date.now()}`,
            }),
            baseOrder({
              supplier_id: SUPPLIER_B,
              order_no: existingNo,
              items: [
                {
                  product_id: PRODUCT_B,
                  quantity: 1,
                  unit_price: 10,
                  sort_order: 0,
                },
              ],
            }),
          ],
        })
      )
    );
    assert(
      "duplicate order_no fails",
      res.ok === false && res.error_code === "DUPLICATE_ORDER_NO"
    );
    assert("no partial orders", count("orders") === beforeOrders);
    assert("no partial items", count("order_items") === beforeItems);
  }

  // missing unit_price
  {
    const before = count("orders");
    const res = JSON.parse(
      callRpc(
        basePayload({
          orders: [
            baseOrder({
              order_no: `PO-NOPRICE-${Date.now()}`,
              items: [
                {
                  product_id: PRODUCT_A,
                  quantity: 1,
                  unit_price: "",
                  sort_order: 0,
                },
              ],
            }),
          ],
        })
      )
    );
    assert(
      "missing price rejected",
      res.ok === false && res.error_code === "INVALID_INPUT"
    );
    assert("missing price no insert", count("orders") === before);
  }

  // missing supplier
  {
    const before = count("orders");
    const res = JSON.parse(
      callRpc(
        basePayload({
          orders: [
            baseOrder({
              supplier_id: "",
              order_no: `PO-NOSUP-${Date.now()}`,
            }),
          ],
        })
      )
    );
    assert(
      "missing supplier rejected",
      res.ok === false && res.error_code === "INVALID_INPUT"
    );
    assert("missing supplier no insert", count("orders") === before);
  }

  // duplicate supplier in one request
  {
    const before = count("orders");
    const res = JSON.parse(
      callRpc(
        basePayload({
          orders: [
            baseOrder({ order_no: `PO-DUP-S1-${Date.now()}` }),
            baseOrder({ order_no: `PO-DUP-S2-${Date.now()}` }),
          ],
        })
      )
    );
    assert(
      "duplicate supplier rejected",
      res.ok === false &&
        res.error_code === "INVALID_INPUT" &&
        String(res.error_message).includes("仕入先")
    );
    assert("dup supplier no insert", count("orders") === before);
  }

  // request_id conflict
  {
    const request_id = randomUUID();
    const first = JSON.parse(
      callRpc(
        basePayload({
          request_id,
          orders: [baseOrder({ order_no: `PO-CONFLICT-1-${Date.now()}` })],
        })
      )
    );
    assert("conflict base ok", first.ok === true);
    const second = JSON.parse(
      callRpc(
        basePayload({
          request_id,
          orders: [baseOrder({ order_no: `PO-CONFLICT-2-${Date.now()}` })],
        })
      )
    );
    assert(
      "request_id conflict",
      second.ok === false && second.error_code === "REQUEST_ID_CONFLICT"
    );
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll create_purchase_orders DB tests passed");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  try {
    execFileSync(
      "sudo",
      ["-u", "postgres", "psql", "-c", `DROP DATABASE IF EXISTS ${DB};`],
      { encoding: "utf8" }
    );
  } catch {
    // ignore cleanup errors
  }
}
