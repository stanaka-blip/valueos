/**
 * PR36: create_case_registration の隔離DBテスト
 * 本番DBは使用しない。
 *
 * Usage:
 *   node scripts/pr36-rpc-local-test.mjs
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DB = "valueos_pr36_rpc_test";
const ROOT = new URL("..", import.meta.url).pathname;

function psql(sql, db = DB) {
  return execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf8" }
  ).trim();
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
  psqlFile(join(ROOT, "scripts/fixtures/pr36-local-schema.sql"));

  const migDir = join(ROOT, "supabase/migrations");
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
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
    try {
      psqlFile(join(migDir, f));
    } catch (e) {
      console.error("migration failed", f, e.stderr?.toString?.() || e.message);
      throw e;
    }
  }

  // PACKAGE 価格（price_target_type migration 後）
  psql(`
    INSERT INTO sales_prices (id, dealer_id, price_target_type, product_id, package_id, sales_price, start_date, is_active)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '${dealer}', 'PACKAGE', NULL, '${pkg}', 1200000, '2026-01-01', true);
    INSERT INTO purchase_prices (id, supplier_id, price_target_type, product_id, package_id, purchase_price, start_date, is_active)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', '${supplier}', 'PACKAGE', NULL, '${pkg}', 900000, '2026-01-01', true);
  `);
}

function callRpc(payload) {
  const json = JSON.stringify(payload).replace(/'/g, "''");
  const out = psql(`SELECT public.create_case_registration('${json}'::jsonb)::text;`);
  return JSON.parse(out);
}

function count(table, where = "true") {
  return Number(psql(`SELECT count(*) FROM ${table} WHERE ${where};`));
}

let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) {
    console.log("OK", name);
  } else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

const dealer = "11111111-1111-1111-1111-111111111111";
const supplier = "22222222-2222-2222-2222-222222222222";
const product = "33333333-3333-3333-3333-333333333333";
const product2 = "33333333-3333-3333-3333-333333333334";
const pkg = "44444444-4444-4444-4444-444444444444";
const badId = "99999999-9999-9999-9999-999999999999";

function basePayload(overrides = {}) {
  return {
    request_id: randomUUID(),
    case: {
      dealer_id: dealer,
      customer_name: "テスト顧客",
      site_address: "東京都テスト1-1",
      order_received_date: "2026-07-26",
      customer_phone: "090",
    },
    settlement: { settlement_type: "掛売" },
    lines: [
      {
        line_type: "PRODUCT",
        product_id: product,
        supplier_id: supplier,
        quantity: 2,
      },
    ],
    ...overrides,
  };
}

setup();

// 1 PRODUCT単一
{
  const p = basePayload();
  const r = callRpc(p);
  assert("1 PRODUCT ok", r.ok === true && r.status === "COMPLETED" && !!r.case_id, JSON.stringify(r));
  assert("1 case_products", count("case_products", `case_id='${r.case_id}'`) === 1);
  assert("1 settlement", count("case_settlements", `case_id='${r.case_id}'`) === 1);
  assert(
    "1 price_fetched_at",
    Number(psql(`SELECT count(*) FROM case_products WHERE case_id='${r.case_id}' AND price_fetched_at IS NOT NULL;`)) === 1
  );
  assert("1 is_manual_false", Number(psql(`SELECT count(*) FROM case_products WHERE case_id='${r.case_id}' AND is_manual_price=false;`)) === 1);
}

// 2 PACKAGE単一
{
  const p = basePayload({
    request_id: randomUUID(),
    lines: [
      {
        line_type: "PACKAGE",
        package_id: pkg,
        supplier_id: supplier,
        quantity: 1,
      },
    ],
  });
  const r = callRpc(p);
  assert("2 PACKAGE ok", r.ok === true, JSON.stringify(r));
  assert("2 case_products PACKAGE", count("case_products", `case_id='${r.case_id}' AND line_type='PACKAGE'`) === 1);
  assert("2 case_packages", count("case_packages", `case_id='${r.case_id}'`) === 1);
  assert(
    "2 case_product_id",
    Number(psql(`SELECT count(*) FROM case_packages WHERE case_id='${r.case_id}' AND case_product_id IS NOT NULL;`)) === 1
  );
  assert("2 items", count("case_package_items", `case_package_id IN (SELECT id FROM case_packages WHERE case_id='${r.case_id}')`) >= 1);
}

// 3 混在
{
  const p = basePayload({
    request_id: randomUUID(),
    lines: [
      { line_type: "PACKAGE", package_id: pkg, supplier_id: supplier, quantity: 1 },
      { line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: 3 },
    ],
  });
  const r = callRpc(p);
  assert("3 mixed ok", r.ok === true, JSON.stringify(r));
  assert("3 lines", count("case_products", `case_id='${r.case_id}'`) === 2);
}

// 4 複数PRODUCT
{
  const p = basePayload({
    request_id: randomUUID(),
    lines: [
      { line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: 1 },
      { line_type: "PRODUCT", product_id: product2, supplier_id: supplier, quantity: 2 },
    ],
  });
  const r = callRpc(p);
  assert("4 multi ok", r.ok === true, JSON.stringify(r));
  assert("4 count", count("case_products", `case_id='${r.case_id}'`) === 2);
}

// 5 販売価格欠落
{
  const beforeCases = count("cases");
  const p = basePayload({
    request_id: randomUUID(),
    lines: [
      { line_type: "PRODUCT", product_id: product2, supplier_id: supplier, quantity: 1 },
    ],
  });
  // remove sales for product2
  psql(`DELETE FROM sales_prices WHERE product_id='${product2}';`);
  const r = callRpc(p);
  assert("5 sales missing", r.ok === false && String(r.error_message).includes("SALES_PRICE_MISSING"), JSON.stringify(r));
  assert("5 no new case", count("cases") === beforeCases);
  // restore sales for later tests
  psql(`INSERT INTO sales_prices (id, dealer_id, price_target_type, product_id, sales_price, start_date, is_active)
        VALUES ('${randomUUID()}', '${dealer}', 'PRODUCT', '${product2}', 5000, '2026-01-01', true);`);
}

// 6 仕入価格欠落
{
  const beforeCases = count("cases");
  psql(`DELETE FROM purchase_prices WHERE product_id='${product}' AND price_target_type='PRODUCT';`);
  const p = basePayload({ request_id: randomUUID() });
  const r = callRpc(p);
  assert("6 purchase missing", r.ok === false && String(r.error_message).includes("PURCHASE_PRICE_MISSING"), JSON.stringify(r));
  assert("6 no new case", count("cases") === beforeCases);
  psql(`INSERT INTO purchase_prices (id, supplier_id, price_target_type, product_id, purchase_price, start_date, is_active)
        VALUES ('${randomUUID()}', '${supplier}', 'PRODUCT', '${product}', 1000, '2026-01-01', true);`);
}

// 7 構成SKU仕入欠落
{
  const beforeCases = count("cases");
  const orphanProduct = "33333333-3333-3333-3333-333333333339";
  psql(`INSERT INTO products (id, name) VALUES ('${orphanProduct}', '欠落構成');`);
  psql(`INSERT INTO package_items (id, package_id, product_id, quantity, sort_order, is_hidden)
        VALUES ('${randomUUID()}', '${pkg}', '${orphanProduct}', 1, 99, false);`);
  const p = basePayload({
    request_id: randomUUID(),
    lines: [{ line_type: "PACKAGE", package_id: pkg, supplier_id: supplier, quantity: 1 }],
  });
  const r = callRpc(p);
  assert("7 component missing", r.ok === false && String(r.error_message).includes("COMPONENT_PURCHASE_PRICE_MISSING"), JSON.stringify(r));
  assert("7 no new case", count("cases") === beforeCases);
  psql(`DELETE FROM package_items WHERE product_id='${orphanProduct}';`);
}

// 8 数量0
{
  const p = basePayload({
    request_id: randomUUID(),
    lines: [{ line_type: "PRODUCT", product_id: product, supplier_id: supplier, quantity: 0 }],
  });
  const r = callRpc(p);
  assert("8 qty0", r.ok === false && String(r.error_message).includes("INVALID_QUANTITY"), JSON.stringify(r));
}

// 9 存在しないID
{
  const p = basePayload({
    request_id: randomUUID(),
    lines: [{ line_type: "PRODUCT", product_id: badId, supplier_id: supplier, quantity: 1 }],
  });
  const r = callRpc(p);
  assert("9 missing product", r.ok === false && String(r.error_message).includes("PRODUCT_NOT_FOUND"), JSON.stringify(r));
}

// 10 決済未指定
{
  const p = basePayload({ request_id: randomUUID(), settlement: { settlement_type: "" } });
  const r = callRpc(p);
  assert("10 no settlement", r.ok === false && String(r.error_message).includes("INVALID_SETTLEMENT"), JSON.stringify(r));
}

// 11 同一request_id再送
{
  const rid = randomUUID();
  const p = basePayload({ request_id: rid });
  const r1 = callRpc(p);
  const r2 = callRpc(p);
  assert("11 first", r1.ok === true && r1.idempotent_replay === false, JSON.stringify(r1));
  assert("11 replay", r2.ok === true && r2.idempotent_replay === true && r2.case_id === r1.case_id, JSON.stringify(r2));
  assert("11 single case", count("cases", `id='${r1.case_id}'`) === 1);
}

// 12 同時二重送信（advisory lock + 冪等）
{
  const rid = randomUUID();
  const payload = basePayload({ request_id: rid });
  const payloadSql = JSON.stringify(payload).replace(/'/g, "''");
  const sqlFile = `/tmp/pr36-parallel-${rid}.sql`;
  writeFileSync(
    sqlFile,
    `SELECT public.create_case_registration('${payloadSql}'::jsonb)::text;\n`
  );
  const cmd = `sudo -u postgres psql -d ${DB} -v ON_ERROR_STOP=1 -At -f ${sqlFile} & sudo -u postgres psql -d ${DB} -v ON_ERROR_STOP=1 -At -f ${sqlFile} & wait`;
  const out = execFileSync("bash", ["-lc", cmd], { encoding: "utf8" });
  const lines = out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("{"));
  const results = lines.map((l) => JSON.parse(l));
  const caseIds = new Set(results.filter((r) => r.ok).map((r) => r.case_id));
  assert("12 parallel single case", caseIds.size === 1 && results.length === 2, JSON.stringify(results));
}

// 13 途中失敗で案件0件増（FAILED後）
{
  const before = {
    cases: count("cases"),
    products: count("case_products"),
    packages: count("case_packages"),
    items: count("case_package_items"),
    settlements: count("case_settlements"),
  };
  const p = basePayload({
    request_id: randomUUID(),
    case: {
      dealer_id: dealer,
      customer_name: "x",
      site_address: "y",
      order_received_date: "2026-07-26",
    },
    lines: [{ line_type: "PRODUCT", product_id: badId, supplier_id: supplier, quantity: 1 }],
  });
  callRpc(p);
  assert("13 cases unchanged", count("cases") === before.cases);
  assert("13 products unchanged", count("case_products") === before.products);
  assert("13 packages unchanged", count("case_packages") === before.packages);
  assert("13 items unchanged", count("case_package_items") === before.items);
  assert("13 settlements unchanged", count("case_settlements") === before.settlements);
}

// 14 手動価格拒否
{
  const p = basePayload({ request_id: randomUUID(), is_manual_price: true });
  const r = callRpc(p);
  assert("14 manual rejected", r.ok === false && r.error_code === "MANUAL_PRICE_DISABLED", JSON.stringify(r));
}

// FAILED retry
{
  const rid = randomUUID();
  const bad = basePayload({
    request_id: rid,
    lines: [{ line_type: "PRODUCT", product_id: badId, supplier_id: supplier, quantity: 1 }],
  });
  const r1 = callRpc(bad);
  assert("retry fail first", r1.ok === false);
  const good = basePayload({ request_id: rid });
  const r2 = callRpc(good);
  assert("retry after FAILED", r2.ok === true && r2.idempotent_replay === false, JSON.stringify(r2));
}

console.log(failed === 0 ? "\nALL_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
