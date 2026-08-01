/**
 * PR36+: create_case_registration 隔離DBテスト（nullable supplier/価格）
 * 本番DBは使用しない。
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DB = "valueos_pr36_rpc_test";
const ROOT = new URL("..", import.meta.url).pathname;

const dealer = "11111111-1111-1111-1111-111111111111";
const supplier = "22222222-2222-2222-2222-222222222222";
const product = "33333333-3333-3333-3333-333333333333";
const product2 = "33333333-3333-3333-3333-333333333334";
const pkg = "44444444-4444-4444-4444-444444444444";
const badId = "99999999-9999-9999-9999-999999999999";
const emptyPkg = "44444444-4444-4444-4444-444444444449";

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

  const allow = [
    "20260726180000_price_target_type.sql",
    "20260726190000_case_products_price_snapshot.sql",
    "20260726190100_case_products_line_target_check.sql",
    "20260726190200_case_products_price_fetched_at.sql",
    "20260726190300_case_packages_case_product_id.sql",
    "20260726210000_case_registration_requests.sql",
    "20260726210100_create_case_registration_rpc.sql",
    "20260801090000_case_registration_nullable_prices.sql",
    // hotfix is applied mid-test after reproducing prod-like NOT NULL failure
  ];
  for (const f of allow) {
    psqlFile(join(ROOT, "supabase/migrations", f));
  }

  // Production-equivalent: package item price columns are NOT NULL
  psql(`
    ALTER TABLE public.case_package_items
      ALTER COLUMN unit_purchase_price SET NOT NULL,
      ALTER COLUMN total_purchase_price SET NOT NULL;
  `);

  psql(`
    INSERT INTO sales_prices (id, dealer_id, price_target_type, product_id, package_id, sales_price, start_date, is_active)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '${dealer}', 'PACKAGE', NULL, '${pkg}', 1200000, '2026-01-01', true);
    INSERT INTO purchase_prices (id, supplier_id, price_target_type, product_id, package_id, purchase_price, start_date, is_active)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', '${supplier}', 'PACKAGE', NULL, '${pkg}', 900000, '2026-01-01', true);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    REVOKE ALL ON FUNCTION public.create_case_registration(jsonb) FROM PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.create_case_registration(jsonb) TO service_role;
    REVOKE ALL ON TABLE public.case_registration_requests FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.case_registration_requests TO service_role;
  `);
}

const HOTFIX_MIGRATION = "20260801120000_case_package_items_prices_nullable.sql";

function packageItemPriceColsNullable() {
  return (
    psql(`
      SELECT count(*) = 2 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='case_package_items'
        AND column_name IN ('unit_purchase_price','total_purchase_price')
        AND is_nullable='YES';
    `) === "t"
  );
}

function packageItemPricesAllNull(caseId) {
  return (
    psql(`
      SELECT count(*) > 0 AND count(*) FILTER (
        WHERE unit_purchase_price IS NOT NULL OR total_purchase_price IS NOT NULL
      ) = 0
      FROM case_package_items
      WHERE case_package_id IN (SELECT id FROM case_packages WHERE case_id='${caseId}');
    `) === "t"
  );
}

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
  const msg = `${result.error_message || ""}`;
  const code = `${result.error_code || ""}`;
  return (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(msg) ||
    /constraint/i.test(msg) ||
    /\bSELECT\b/i.test(msg) ||
    /\bINSERT\b/i.test(msg) ||
    /\bUPDATE\b/i.test(msg) ||
    /case_products|case_packages|pg_/i.test(msg) ||
    !["INVALID_INPUT", "PACKAGE_ITEMS_NOT_FOUND", "REQUEST_ID_CONFLICT", "REGISTRATION_FAILED"].includes(code)
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

function lineNullPrices(caseId) {
  return (
    psql(
      `SELECT count(*) = 0 FROM case_products
       WHERE case_id='${caseId}'
         AND (
           supplier_id IS NOT NULL
           OR sales_price IS NOT NULL
           OR purchase_price IS NOT NULL
           OR gross_profit IS NOT NULL
           OR sales_price_id IS NOT NULL
           OR purchase_price_id IS NOT NULL
           OR price_fetched_at IS NOT NULL
         );`
    ) === "t"
  );
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

// empty package still rejected + rollback
{
  psql(`
    INSERT INTO packages (id, name) VALUES ('${emptyPkg}', 'EMPTY') ON CONFLICT DO NOTHING;
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
      lines: [{ line_type: "PACKAGE", package_id: emptyPkg, quantity: 1 }],
    })
  );
  assert("5 empty PACKAGE FAILED", r.ok === false && r.error_code === "PACKAGE_ITEMS_NOT_FOUND", JSON.stringify(r));
  assert(
    "6 empty no business rows",
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
    lines: [{ line_type: "PRODUCT", product_id: product, quantity: 1 }],
  };
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
        lines: [{ line_type: "PRODUCT", product_id: product, quantity: qty }],
      })
    );
    assert(`11 qty ${label} rejected`, r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
  }
  assert(
    "11b qty 1 ok",
    callRpc(
      basePayload({
        request_id: randomUUID(),
        lines: [{ line_type: "PRODUCT", product_id: product, quantity: 1 }],
      })
    ).ok === true
  );
  assert(
    "11c qty 9999 ok",
    callRpc(
      basePayload({
        request_id: randomUUID(),
        lines: [{ line_type: "PRODUCT", product_id: product, quantity: 9999 }],
      })
    ).ok === true
  );
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

// Reproduce production bug: PACKAGE insert of NULL prices fails while columns are NOT NULL
{
  assert("13c prod-like NOT NULL before hotfix", packageItemPriceColsNullable() === false);
  const beforeItems = count("case_package_items");
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [{ line_type: "PACKAGE", package_id: pkg, quantity: 1 }],
    })
  );
  assert(
    "13d PACKAGE fails under NOT NULL price cols",
    r.ok === false && r.error_code === "REGISTRATION_FAILED",
    JSON.stringify(r)
  );
  assert("13e PACKAGE failure rolls back items", count("case_package_items") === beforeItems);
}

// Apply hotfix (and re-apply for idempotency)
{
  psqlFile(join(ROOT, "supabase/migrations", HOTFIX_MIGRATION));
  assert("13f hotfix makes price cols nullable", packageItemPriceColsNullable() === true);
  psqlFile(join(ROOT, "supabase/migrations", HOTFIX_MIGRATION));
  assert("13g hotfix re-apply is no-op", packageItemPriceColsNullable() === true);
}

// Seed a legacy priced case_package_items row (must remain unchanged by later registrations)
const legacyPkgCaseId = randomUUID();
const legacyCasePackageId = randomUUID();
const legacyItemId = randomUUID();
const legacyItemFpBefore = (() => {
  psql(`
    INSERT INTO cases (id, case_no, dealer_id, customer_name, site_address, status)
    VALUES ('${legacyPkgCaseId}', 'LEGACY-PKG-1', '${dealer}', '既存PKG', '住所', '新規受付');
    INSERT INTO case_packages (id, case_id, package_id, quantity)
    VALUES ('${legacyCasePackageId}', '${legacyPkgCaseId}', '${pkg}', 1);
    INSERT INTO case_package_items (
      id, case_package_id, product_id, quantity,
      unit_purchase_price, total_purchase_price, is_selected, is_added_manually, is_hidden, sort_order
    ) VALUES (
      '${legacyItemId}', '${legacyCasePackageId}', '${product}', 1,
      5000, 5000, true, false, false, 0
    );
  `);
  return psql(`
    SELECT coalesce(unit_purchase_price::text,'') || '|' || coalesce(total_purchase_price::text,'') || '|' || coalesce(quantity::text,'')
    FROM case_package_items WHERE id='${legacyItemId}';
  `);
})();

// PRODUCT without supplier/prices (and even with prices deleted) succeeds with NULL snapshots
{
  psql(`DELETE FROM sales_prices WHERE product_id='${product2}';`);
  psql(`DELETE FROM purchase_prices WHERE product_id='${product2}';`);
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [{ line_type: "PRODUCT", product_id: product2, quantity: 1 }],
    })
  );
  assert("14 PRODUCT no prices ok", r.ok === true, JSON.stringify(r));
  assert("14b PRODUCT null snapshots", lineNullPrices(r.case_id), r.case_id);
}

// success paths without supplier_id
{
  const r = callRpc(basePayload({ request_id: randomUUID() }));
  assert("15 PRODUCT success no supplier", r.ok === true && lineNullPrices(r.case_id), JSON.stringify(r));
}
{
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [{ line_type: "PACKAGE", package_id: pkg, quantity: 1 }],
    })
  );
  assert(
    "16 PACKAGE success no supplier",
    r.ok === true &&
      count("case_packages", `case_id='${r.case_id}' AND case_product_id IS NOT NULL`) === 1 &&
      lineNullPrices(r.case_id) &&
      packageItemPricesAllNull(r.case_id),
    JSON.stringify(r)
  );
}
{
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [
        { line_type: "PACKAGE", package_id: pkg, quantity: 1 },
        { line_type: "PRODUCT", product_id: product, quantity: 2 },
      ],
    })
  );
  assert(
    "17 mixed success",
    r.ok === true &&
      count("case_products", `case_id='${r.case_id}'`) === 2 &&
      lineNullPrices(r.case_id) &&
      packageItemPricesAllNull(r.case_id),
    JSON.stringify(r)
  );
}

// multi lines
{
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [
        { line_type: "PRODUCT", product_id: product, quantity: 1 },
        { line_type: "PRODUCT", product_id: product2, quantity: 2 },
        { line_type: "PACKAGE", package_id: pkg, quantity: 3 },
      ],
    })
  );
  assert("17b multi lines", r.ok === true && count("case_products", `case_id='${r.case_id}'`) === 3, JSON.stringify(r));
}

// old payload with supplier_id still works, but supplier/prices are NOT saved
{
  const r = callRpc(
    basePayload({
      request_id: randomUUID(),
      lines: [{ line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: 1 }],
    })
  );
  assert("18 legacy supplier_id accepted", r.ok === true, JSON.stringify(r));
  assert("18b legacy supplier not persisted", lineNullPrices(r.case_id), r.case_id);
}

// existing priced rows are not modified by new registrations
{
  const legacyId = randomUUID();
  psql(`
    INSERT INTO cases (id, case_no, dealer_id, customer_name, site_address, status)
    VALUES ('${legacyId}', 'LEGACY-1', '${dealer}', '既存', '住所', '新規受付');
    INSERT INTO case_products (
      case_id, line_type, product_id, supplier_id, quantity,
      sales_price, purchase_price, gross_profit, is_manual_price
    ) VALUES (
      '${legacyId}', 'PRODUCT', '${product}', '${supplier}', 1,
      10000, 6000, 4000, false
    );
  `);
  const before = psql(
    `SELECT supplier_id::text || '|' || sales_price::text || '|' || purchase_price::text || '|' || gross_profit::text
     FROM case_products WHERE case_id='${legacyId}' LIMIT 1;`
  );
  const r = callRpc(basePayload({ request_id: randomUUID() }));
  const after = psql(
    `SELECT supplier_id::text || '|' || sales_price::text || '|' || purchase_price::text || '|' || gross_profit::text
     FROM case_products WHERE case_id='${legacyId}' LIMIT 1;`
  );
  assert("19 existing priced row unchanged", r.ok === true && before === after && before.includes(supplier), `${before} vs ${after}`);
}

// existing priced case_package_items row unchanged after successful PACKAGE registrations
{
  const after = psql(`
    SELECT coalesce(unit_purchase_price::text,'') || '|' || coalesce(total_purchase_price::text,'') || '|' || coalesce(quantity::text,'')
    FROM case_package_items WHERE id='${legacyItemId}';
  `);
  assert(
    "19b existing package item prices unchanged",
    after === legacyItemFpBefore && after === "5000|5000|1",
    `${legacyItemFpBefore} vs ${after}`
  );
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
  assert("20 parallel one case", caseIds.size === 1 && results.length === 2, JSON.stringify(results));
}

{
  const r = callRpc(basePayload({ request_id: randomUUID(), is_manual_price: true }));
  assert("legacy manual rejected", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}
{
  const bad = basePayload({
    request_id: randomUUID(),
    lines: [{ line_type: "PRODUCT", product_id: badId, quantity: 1 }],
  });
  const r = callRpc(bad);
  assert("legacy bad id", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}

// columns nullable after migration
{
  const nullable = psql(`
    SELECT count(*) = 7 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='case_products'
      AND column_name IN (
        'supplier_id','sales_price','purchase_price','gross_profit',
        'sales_price_id','purchase_price_id','price_fetched_at'
      )
      AND is_nullable='YES';
  `);
  assert("21 case_products price cols nullable", nullable === "t", nullable);
  assert("21b case_package_items price cols nullable", packageItemPriceColsNullable() === true);
}

console.log(failed === 0 ? "\nALL_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
