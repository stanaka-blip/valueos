/**
 * PR-B: append_case_line 隔離DBテスト
 * 本番DBは使用しない。
 * 実行: node scripts/pr-case-detail-line-add-api-db-test.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DB = "valueos_pr_append_case_line_test";
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
    // SET ROLE の "SET" 行を避けるため、単一 SELECT 内で ROLE を切り替えない。
    // 代わりに -c を分け、最終行のみ返す。
    args.push("-c", `SET ROLE ${role}`);
    args.push("-c", sql);
  } else {
    args.push("-c", sql);
  }
  const out = execFileSync("sudo", args, { encoding: "utf8" }).trim();
  if (!out) return "";
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
  // SET ROLE の出力 "SET" を除去
  const filtered = lines.filter((l) => l !== "SET");
  return filtered[filtered.length - 1] || "";
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

  const migrations = [
    "20260726180000_price_target_type.sql",
    "20260726190000_case_products_price_snapshot.sql",
    "20260726190100_case_products_line_target_check.sql",
    "20260726190200_case_products_price_fetched_at.sql",
    "20260726190300_case_packages_case_product_id.sql",
    "20260726210000_case_registration_requests.sql",
    "20260726210100_create_case_registration_rpc.sql",
    "20260801090000_case_registration_nullable_prices.sql",
    "20260801120000_case_package_items_prices_nullable.sql",
    "20260801140000_case_settlements_finance_detail_columns.sql",
    "20260801160000_case_registration_settlement_spec.sql",
    "20260801170000_append_case_line_rpc.sql",
  ];
  for (const f of migrations) {
    psqlFile(join(ROOT, "supabase/migrations", f));
  }

  // Migration 2回適用（再実行耐性）
  psqlFile(join(ROOT, "supabase/migrations/20260801170000_append_case_line_rpc.sql"));

  psql(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    REVOKE ALL ON TABLE public.case_line_append_requests FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.case_line_append_requests TO service_role;
    REVOKE ALL ON FUNCTION public.append_case_line(jsonb) FROM PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.append_case_line(jsonb) TO service_role;
  `);

  // seed case
  psql(`
    INSERT INTO cases (id, case_no, dealer_id, customer_name, site_address, status)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'VE-APPEND-1',
      '11111111-1111-1111-1111-111111111111',
      '顧客A',
      '東京都',
      '新規受付'
    );
    -- empty package for reject test
    INSERT INTO packages (id, name, is_active)
    VALUES ('44444444-4444-4444-4444-444444444449', 'EMPTY-PKG', true);
  `);
}

function count(table, where = "true") {
  return Number(psql(`SELECT count(*)::int FROM ${table} WHERE ${where};`));
}

function callRpc(payload, role = "service_role") {
  const json = JSON.stringify(payload).replace(/'/g, "''");
  return psql(`SELECT public.append_case_line('${json}'::jsonb)::text;`, DB, role);
}

const CASE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PRODUCT_ID = "33333333-3333-3333-3333-333333333333";
const PACKAGE_ID = "44444444-4444-4444-4444-444444444444";
const EMPTY_PKG = "44444444-4444-4444-4444-444444444449";

try {
  setup();

  assert(
    "function exists",
    psql(`SELECT count(*) FROM pg_proc WHERE proname='append_case_line';`) === "1"
  );
  assert(
    "ledger table exists",
    psql(`SELECT to_regclass('public.case_line_append_requests') IS NOT NULL;`) === "t"
  );

  // privileges
  {
    let anonDenied = false;
    try {
      callRpc(
        {
          request_id: randomUUID(),
          case_id: CASE_ID,
          line_type: "PRODUCT",
          product_id: PRODUCT_ID,
          quantity: 1,
        },
        "anon"
      );
    } catch {
      anonDenied = true;
    }
    assert("anon cannot execute", anonDenied);

    let authDenied = false;
    try {
      callRpc(
        {
          request_id: randomUUID(),
          case_id: CASE_ID,
          line_type: "PRODUCT",
          product_id: PRODUCT_ID,
          quantity: 1,
        },
        "authenticated"
      );
    } catch {
      authDenied = true;
    }
    assert("authenticated cannot execute", authDenied);
  }

  const beforeProducts = count("case_products");
  const beforePackages = count("case_packages");
  const beforeItems = count("case_package_items");

  // PRODUCT success
  const reqProduct = randomUUID();
  const productRes = JSON.parse(
    callRpc({
      request_id: reqProduct,
      case_id: CASE_ID,
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 2,
    })
  );
  assert("PRODUCT ok", productRes.ok === true && productRes.line_type === "PRODUCT");
  assert(
    "PRODUCT null prices",
    psql(`
      SELECT count(*) = 1 FROM case_products
      WHERE id='${productRes.case_product_id}'
        AND line_type='PRODUCT'
        AND product_id='${PRODUCT_ID}'
        AND package_id IS NULL
        AND supplier_id IS NULL
        AND sales_price IS NULL
        AND purchase_price IS NULL
        AND gross_profit IS NULL
        AND quantity=2;
    `) === "t"
  );

  // PACKAGE success
  const reqPkg = randomUUID();
  const pkgRes = JSON.parse(
    callRpc({
      request_id: reqPkg,
      case_id: CASE_ID,
      line_type: "PACKAGE",
      package_id: PACKAGE_ID,
      quantity: 3,
    })
  );
  assert("PACKAGE ok", pkgRes.ok === true && pkgRes.line_type === "PACKAGE");
  assert(
    "PACKAGE header XOR",
    psql(`
      SELECT count(*) = 1 FROM case_products
      WHERE id='${pkgRes.case_product_id}'
        AND line_type='PACKAGE'
        AND product_id IS NULL
        AND package_id='${PACKAGE_ID}'
        AND sales_price IS NULL
        AND purchase_price IS NULL
        AND supplier_id IS NULL;
    `) === "t"
  );
  assert(
    "PACKAGE items qty = component * package qty",
    psql(`
      SELECT count(*) = 1 AND max(quantity) = 6 FROM case_package_items
      WHERE case_package_id='${pkgRes.case_package_id}'
        AND unit_purchase_price IS NULL
        AND total_purchase_price IS NULL;
    `) === "t",
    "expected item qty 2*3=6"
  );

  // empty package reject before write
  const beforeEmpty = {
    p: count("case_products"),
    g: count("case_packages"),
    i: count("case_package_items"),
  };
  const emptyRes = JSON.parse(
    callRpc({
      request_id: randomUUID(),
      case_id: CASE_ID,
      line_type: "PACKAGE",
      package_id: EMPTY_PKG,
      quantity: 1,
    })
  );
  assert(
    "empty PACKAGE rejected",
    emptyRes.ok === false && emptyRes.error_code === "PACKAGE_ITEMS_NOT_FOUND"
  );
  assert(
    "empty PACKAGE no inserts",
    count("case_products") === beforeEmpty.p &&
      count("case_packages") === beforeEmpty.g &&
      count("case_package_items") === beforeEmpty.i
  );

  // mid-fail rollback (trigger on case_package_items)
  psql(`
    CREATE OR REPLACE FUNCTION public._test_fail_package_items()
    RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      RAISE EXCEPTION 'forced mid-fail';
    END;
    $f$;
    CREATE TRIGGER _test_fail_package_items_trg
      BEFORE INSERT ON public.case_package_items
      FOR EACH ROW EXECUTE FUNCTION public._test_fail_package_items();
  `);
  const beforeFail = {
    p: count("case_products"),
    g: count("case_packages"),
    i: count("case_package_items"),
  };
  const failRes = JSON.parse(
    callRpc({
      request_id: randomUUID(),
      case_id: CASE_ID,
      line_type: "PACKAGE",
      package_id: PACKAGE_ID,
      quantity: 1,
    })
  );
  assert("mid-fail returns failure", failRes.ok === false);
  assert(
    "mid-fail rolls back all business inserts",
    count("case_products") === beforeFail.p &&
      count("case_packages") === beforeFail.g &&
      count("case_package_items") === beforeFail.i
  );
  psql(`
    DROP TRIGGER IF EXISTS _test_fail_package_items_trg ON public.case_package_items;
    DROP FUNCTION IF EXISTS public._test_fail_package_items();
  `);

  // idempotent replay same payload
  const replay = JSON.parse(
    callRpc({
      request_id: reqProduct,
      case_id: CASE_ID,
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 2,
    })
  );
  assert(
    "same key+payload replays same id",
    replay.ok === true &&
      replay.idempotent_replay === true &&
      replay.case_product_id === productRes.case_product_id
  );
  assert(
    "replay does not add rows",
    count("case_products") === beforeProducts + 2 // product + package header only
  );

  // conflict different payload
  const conflict = JSON.parse(
    callRpc({
      request_id: reqProduct,
      case_id: CASE_ID,
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 9,
    })
  );
  assert(
    "same key different payload → REQUEST_ID_CONFLICT",
    conflict.ok === false && conflict.error_code === "REQUEST_ID_CONFLICT"
  );

  // concurrent same key → one line set
  const concurrentKey = randomUUID();
  const payload = JSON.stringify({
    request_id: concurrentKey,
    case_id: CASE_ID,
    line_type: "PRODUCT",
    product_id: PRODUCT_ID,
    quantity: 1,
  }).replace(/'/g, "''");
  const beforeConc = count("case_products");
  const sqlPath = `/tmp/append_case_line_conc_${concurrentKey}.sql`;
  writeFileSync(
    sqlPath,
    `SET ROLE service_role;\nSELECT public.append_case_line('${payload}'::jsonb);\n`
  );
  const conc = spawnSync(
    "bash",
    [
      "-lc",
      `sudo -u postgres psql -d ${DB} -v ON_ERROR_STOP=1 -f ${sqlPath} & ` +
        `sudo -u postgres psql -d ${DB} -v ON_ERROR_STOP=1 -f ${sqlPath} & ` +
        `wait`,
    ],
    { encoding: "utf8" }
  );
  try {
    unlinkSync(sqlPath);
  } catch {
    // ignore
  }
  assert(
    "concurrent calls exit 0",
    conc.status === 0,
    `${conc.stdout}\n${conc.stderr}`
  );
  assert(
    "concurrent same key adds only one PRODUCT row",
    count("case_products") === beforeConc + 1
  );

  // different keys can add separately
  const k1 = randomUUID();
  const k2 = randomUUID();
  const beforeDiff = count("case_products");
  const d1 = JSON.parse(
    callRpc({
      request_id: k1,
      case_id: CASE_ID,
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 1,
    })
  );
  const d2 = JSON.parse(
    callRpc({
      request_id: k2,
      case_id: CASE_ID,
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 1,
    })
  );
  assert(
    "different keys add separate lines",
    d1.ok &&
      d2.ok &&
      d1.case_product_id !== d2.case_product_id &&
      count("case_products") === beforeDiff + 2
  );

  // qty boundary
  const badQty = JSON.parse(
    callRpc({
      request_id: randomUUID(),
      case_id: CASE_ID,
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 10000,
    })
  );
  assert(
    "qty 10000 rejected",
    badQty.ok === false && badQty.error_code === "INVALID_INPUT"
  );

  // grants table
  const execPriv = psql(`
    SELECT coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee), '')
    FROM information_schema.role_routine_grants
    WHERE specific_schema='public' AND routine_name='append_case_line';
  `);
  assert(
    "EXECUTE only service_role (no anon/authenticated in grants)",
    execPriv.includes("service_role:EXECUTE") &&
      !execPriv.includes("anon:EXECUTE") &&
      !execPriv.includes("authenticated:EXECUTE"),
    execPriv
  );

  const tablePriv = psql(`
    SELECT coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), '')
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='case_line_append_requests';
  `);
  assert(
    "ledger grants exclude anon/authenticated",
    !tablePriv.includes("anon:") && !tablePriv.includes("authenticated:"),
    tablePriv
  );

  // baseline tables grew only by intended tests; ensure create_case_registration still present
  assert(
    "create_case_registration untouched",
    psql(`SELECT count(*) FROM pg_proc WHERE proname='create_case_registration';`) === "1"
  );

  void beforePackages;
  void beforeItems;
} catch (e) {
  failed += 1;
  console.error("FAIL suite", e);
} finally {
  try {
    execFileSync(
      "sudo",
      ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${DB};`],
      { encoding: "utf8" }
    );
  } catch {
    // ignore
  }
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll append_case_line DB checks passed");
