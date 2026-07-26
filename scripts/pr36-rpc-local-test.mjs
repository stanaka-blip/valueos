/**
 * PR36: create_case_registration 隔離DBテスト（案C権限含む）
 * 本番DBは使用しない。
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DB = "valueos_pr36_rpc_test";
const ROOT = new URL("..", import.meta.url).pathname;

function psql(sql, db = DB, role = null) {
  const args = ["-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"];
  if (role) {
    args.push("-c", `SET ROLE ${role}; ${sql}`);
  } else {
    args.push("-c", sql);
  }
  return execFileSync("sudo", args, { encoding: "utf8" }).trim();
}

function psqlFile(file, db = DB) {
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", file],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function setup() {
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${DB};`], {
    encoding: "utf8",
  });
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${DB};`], {
    encoding: "utf8",
  });

  // roles for privilege tests
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
  // recreate on test db cluster - roles are cluster-wide, ok

  psqlFile(join(ROOT, "scripts/fixtures/pr36-local-schema.sql"));

  const allow = [
    "20260726180000_price_target_type.sql",
    "20260726190000_case_products_price_snapshot.sql",
    "20260726190100_case_products_line_target_check.sql",
    "20260726190200_case_products_price_fetched_at.sql",
    "20260726190300_case_packages_case_product_id.sql",
    "20260726210000_case_registration_requests.sql",
    "20260726210100_create_case_registration_rpc.sql",
  ];
  for (const f of allow) {
    psqlFile(join(ROOT, "supabase/migrations", f));
  }

  psql(`
    INSERT INTO sales_prices (id, dealer_id, price_target_type, product_id, package_id, sales_price, start_date, is_active)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '${dealer}', 'PACKAGE', NULL, '${pkg}', 1200000, '2026-01-01', true);
    INSERT INTO purchase_prices (id, supplier_id, price_target_type, product_id, package_id, purchase_price, start_date, is_active)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', '${supplier}', 'PACKAGE', NULL, '${pkg}', 900000, '2026-01-01', true);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    -- 業務表は service_role INVOKER 用。requests は migration 再適用相当で最小権限へ閉じる。
    REVOKE ALL ON FUNCTION public.create_case_registration(jsonb) FROM PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.create_case_registration(jsonb) TO service_role;
    REVOKE ALL ON TABLE public.case_registration_requests FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.case_registration_requests TO service_role;
  `);
}

const dealer = "11111111-1111-1111-1111-111111111111";
const supplier = "22222222-2222-2222-2222-222222222222";
const product = "33333333-3333-3333-3333-333333333333";
const product2 = "33333333-3333-3333-3333-333333333334";
const pkg = "44444444-4444-4444-4444-444444444444";
const badId = "99999999-9999-9999-9999-999999999999";
const emptyPkg = "44444444-4444-4444-4444-444444444449";

function parseJsonLine(out) {
  const line = out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("{"))
    .pop();
  if (!line) throw new Error(`no json line in: ${out}`);
  return JSON.parse(line);
}

function callRpc(payload, asRole = null) {
  const json = JSON.stringify(payload).replace(/'/g, "''");
  const sql = `SELECT public.create_case_registration('${json}'::jsonb)::text;`;
  if (!asRole) {
    return parseJsonLine(psql(sql));
  }
  try {
    const out = execFileSync(
      "sudo",
      [
        "-u",
        "postgres",
        "psql",
        "-d",
        DB,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-c",
        `SET ROLE ${asRole}`,
        "-c",
        sql,
        "-c",
        "RESET ROLE",
      ],
      { encoding: "utf8" }
    ).trim();
    return { ok_exec: true, result: parseJsonLine(out) };
  } catch (e) {
    return {
      ok_exec: false,
      stderr: (e.stderr || e.message || "").toString(),
    };
  }
}

function hasInternalLeak(result) {
  // request_id はクライアント入力のエコーなので検査対象外。利用者向け文言のみ見る。
  const msg = `${result.error_message || ""}`;
  const code = `${result.error_code || ""}`;
  return (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(msg) ||
    /constraint/i.test(msg) ||
    /\bSELECT\b/i.test(msg) ||
    /\bINSERT\b/i.test(msg) ||
    /\bUPDATE\b/i.test(msg) ||
    /case_products|case_packages|pg_/i.test(msg) ||
    !["INVALID_INPUT", "PRICE_NOT_FOUND", "PACKAGE_ITEMS_NOT_FOUND", "PACKAGE_ITEM_PRICE_NOT_FOUND", "REQUEST_ID_CONFLICT", "REGISTRATION_FAILED"].includes(code)
  );
}

function roleCanExecuteRpc(role) {
  return (
    psql(
      `SELECT has_function_privilege('${role}', 'public.create_case_registration(jsonb)', 'EXECUTE');`
    ) === "t"
  );
}

function roleTablePriv(role, priv) {
  return (
    psql(
      `SELECT has_table_privilege('${role}', 'public.case_registration_requests', '${priv}');`
    ) === "t"
  );
}

function count(table, where = "true") {
  return Number(psql(`SELECT count(*) FROM ${table} WHERE ${where};`));
}

let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function basePayload(overrides = {}) {
  const { case: caseOverride, lines, settlement, request_id, ...rest } = overrides;
  return {
    request_id: request_id || randomUUID(),
    case: {
      dealer_id: dealer,
      customer_name: "テスト顧客",
      site_address: "東京都テスト1-1",
      order_received_date: "2026-07-26",
      customer_phone: "090",
      ...(caseOverride || {}),
    },
    settlement: settlement || { settlement_type: "掛売" },
    lines: lines || [
      {
        line_type: "PRODUCT",
        product_id: product,
        supplier_id: supplier,
        quantity: 2,
      },
    ],
    ...rest,
  };
}

setup();

// privilege: RPC
{
  assert("1 anon cannot execute RPC", roleCanExecuteRpc("anon") === false && callRpc(basePayload(), "anon").ok_exec === false);
  assert(
    "2 authenticated cannot execute RPC",
    roleCanExecuteRpc("authenticated") === false && callRpc(basePayload(), "authenticated").ok_exec === false
  );
  const svc = callRpc(basePayload(), "service_role");
  assert(
    "3 service_role can execute RPC",
    roleCanExecuteRpc("service_role") === true && svc.ok_exec === true && svc.result.ok === true,
    JSON.stringify(svc).slice(0, 300)
  );
}

// privilege: requests table
assert("4a anon cannot SELECT requests", roleTablePriv("anon", "SELECT") === false);
assert("4b anon cannot INSERT requests", roleTablePriv("anon", "INSERT") === false);
assert("4c authenticated cannot SELECT requests", roleTablePriv("authenticated", "SELECT") === false);
assert("4d authenticated cannot UPDATE requests", roleTablePriv("authenticated", "UPDATE") === false);
assert("4e authenticated cannot DELETE requests", roleTablePriv("authenticated", "DELETE") === false);
assert("4f anon cannot DELETE requests", roleTablePriv("anon", "DELETE") === false);
assert(
  "4g service_role has SELECT/INSERT/UPDATE only",
  roleTablePriv("service_role", "SELECT") &&
    roleTablePriv("service_role", "INSERT") &&
    roleTablePriv("service_role", "UPDATE") &&
    roleTablePriv("service_role", "DELETE") === false
);

// empty package
{
  psql(`
    INSERT INTO packages (id, name) VALUES ('${emptyPkg}', 'EMPTY') ON CONFLICT DO NOTHING;
    INSERT INTO sales_prices (id, dealer_id, price_target_type, package_id, sales_price, start_date, is_active)
    VALUES ('${randomUUID()}', '${dealer}', 'PACKAGE', '${emptyPkg}', 100, '2026-01-01', true);
    INSERT INTO purchase_prices (id, supplier_id, price_target_type, package_id, purchase_price, start_date, is_active)
    VALUES ('${randomUUID()}', '${supplier}', 'PACKAGE', '${emptyPkg}', 50, '2026-01-01', true);
  `);
  const before = {
    cases: count("cases"),
    products: count("case_products"),
    packages: count("case_packages"),
    items: count("case_package_items"),
    settlements: count("case_settlements"),
  };
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [{ line_type: "PACKAGE", package_id: emptyPkg, supplier_id: supplier, quantity: 1 }],
    })
  );
  assert("5 empty PACKAGE FAILED", r.ok === false && r.error_code === "PACKAGE_ITEMS_NOT_FOUND", JSON.stringify(r));
  assert("6 empty no business rows", 
    count("cases") === before.cases &&
    count("case_products") === before.products &&
    count("case_packages") === before.packages &&
    count("case_package_items") === before.items &&
    count("case_settlements") === before.settlements
  );
  assert("6b no internal leak in message", !hasInternalLeak(r), JSON.stringify(r));
}

// idempotent same payload
{
  const rid = randomUUID();
  const p = basePayload({ request_id: rid });
  const r1 = callRpc(p);
  const r2 = callRpc(p);
  assert("7 same payload idempotent", r1.ok && r2.ok && r2.idempotent_replay === true && r1.case_id === r2.case_id, JSON.stringify({ r1, r2 }));
}

// different payload same request_id
{
  const rid = randomUUID();
  const r1 = callRpc(basePayload({ request_id: rid, case: { customer_name: "A" } }));
  const r2 = callRpc(basePayload({ request_id: rid, case: { customer_name: "B" } }));
  assert("8 different payload CONFLICT", r1.ok && r2.ok === false && r2.error_code === "REQUEST_ID_CONFLICT", JSON.stringify(r2));
}

// key order independence
{
  const rid = randomUUID();
  const p1 = {
    request_id: rid,
    case: {
      dealer_id: dealer,
      customer_name: "キー順",
      site_address: "住所",
      order_received_date: "2026-07-26",
    },
    settlement: { settlement_type: "掛売" },
    lines: [{ line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: 1 }],
  };
  // reorder keys
  const p2 = {
    lines: p1.lines,
    settlement: p1.settlement,
    case: {
      order_received_date: "2026-07-26",
      site_address: "住所",
      customer_name: "キー順",
      dealer_id: dealer,
    },
    request_id: rid,
  };
  const r1 = callRpc(p1);
  const r2 = callRpc(p2);
  assert("9 key order same hash", r1.ok && r2.ok && r2.idempotent_replay === true && r1.case_id === r2.case_id, JSON.stringify({ r1, r2 }));
}

// 101 lines
{
  const lines = Array.from({ length: 101 }, () => ({
    line_type: "PRODUCT",
    product_id: product,
    supplier_id: supplier,
    quantity: 1,
  }));
  const r = callRpc(basePayload({ request_id: randomUUID(), lines }));
  assert("10 101 lines rejected", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}

// qty bounds
{
  for (const [label, qty] of [
    ["0", 0],
    ["neg", -1],
    ["10000", 10000],
  ]) {
    const r = callRpc(
      basePayload({
        request_id: randomUUID(),
        lines: [{ line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: qty }],
      })
    );
    assert(`11 qty ${label} rejected`, r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
  }
}

// empty required strings
{
  const r = callRpc(basePayload({ request_id: randomUUID(), case: { customer_name: "  " } }));
  assert("12 empty required rejected", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}

// long string
{
  const r = callRpc(basePayload({ request_id: randomUUID(), case: { customer_name: "あ".repeat(501) } }));
  assert("13 long string rejected", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}

// error sanitization on price miss
{
  psql(`DELETE FROM sales_prices WHERE product_id='${product2}';`);
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [{ line_type: "PRODUCT", product_id: product2, supplier_id: supplier, quantity: 1 }],
    })
  );
  const s = JSON.stringify(r);
  assert("14 no uuid/sql/constraint", r.error_code === "PRICE_NOT_FOUND" && !hasInternalLeak(r), s);
  psql(`INSERT INTO sales_prices (id, dealer_id, price_target_type, product_id, sales_price, start_date, is_active)
        VALUES ('${randomUUID()}', '${dealer}', 'PRODUCT', '${product2}', 5000, '2026-01-01', true);`);
}

// success paths
{
  const r = callRpc(basePayload({ request_id: randomUUID() }));
  assert("15 PRODUCT success", r.ok === true, JSON.stringify(r));
}
{
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [{ line_type: "PACKAGE", package_id: pkg, supplier_id: supplier, quantity: 1 }],
    })
  );
  assert("16 PACKAGE success", r.ok === true && count("case_packages", `case_id='${r.case_id}' AND case_product_id IS NOT NULL`) === 1, JSON.stringify(r));
}
{
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [
        { line_type: "PACKAGE", package_id: pkg, supplier_id: supplier, quantity: 1 },
        { line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: 2 },
      ],
    })
  );
  assert("17 mixed success", r.ok === true && count("case_products", `case_id='${r.case_id}'`) === 2, JSON.stringify(r));
}

// price miss rollback
{
  const before = count("cases");
  psql(`DELETE FROM purchase_prices WHERE product_id='${product}' AND price_target_type='PRODUCT';`);
  const r = callRpc(basePayload({ request_id: randomUUID() }));
  assert("18 price miss rollback", r.ok === false && count("cases") === before, JSON.stringify(r));
  psql(`INSERT INTO purchase_prices (id, supplier_id, price_target_type, product_id, purchase_price, start_date, is_active)
        VALUES ('${randomUUID()}', '${supplier}', 'PRODUCT', '${product}', 1000, '2026-01-01', true);`);
}

// parallel
{
  const rid = randomUUID();
  const payload = basePayload({ request_id: rid });
  const payloadSql = JSON.stringify(payload).replace(/'/g, "''");
  const sqlFile = `/tmp/pr36-parallel-${rid}.sql`;
  writeFileSync(sqlFile, `SET ROLE service_role;\nSELECT public.create_case_registration('${payloadSql}'::jsonb)::text;\n`);
  const cmd = `sudo -u postgres psql -d ${DB} -v ON_ERROR_STOP=1 -At -f ${sqlFile} & sudo -u postgres psql -d ${DB} -v ON_ERROR_STOP=1 -At -f ${sqlFile} & wait`;
  const out = execFileSync("bash", ["-lc", cmd], { encoding: "utf8" });
  const results = out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("{"))
    .map((l) => JSON.parse(l));
  const caseIds = new Set(results.filter((r) => r.ok).map((r) => r.case_id));
  assert("19 parallel one case", caseIds.size === 1 && results.length === 2, JSON.stringify(results));
}

// legacy success extras
{
  const r = callRpc(basePayload({ request_id: randomUUID(), lines: [
    { line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: 1 },
    { line_type: "PRODUCT", product_id: product2, supplier_id: supplier, quantity: 2 },
  ]}));
  assert("legacy multi product", r.ok === true, JSON.stringify(r));
}
{
  const r = callRpc(basePayload({ request_id: randomUUID(), is_manual_price: true }));
  assert("legacy manual rejected", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}
{
  const bad = basePayload({ request_id: randomUUID(), lines: [{ line_type: "PRODUCT", product_id: badId, supplier_id: supplier, quantity: 1 }]});
  const r = callRpc(bad);
  assert("legacy bad id", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}

console.log(failed === 0 ? "\nALL_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
