/**
 * 案件登録RPC 決済仕様対応の隔離DB + 静的テスト。
 * Run: node scripts/pr-case-registration-settlement-spec-test.mjs
 * 本番DBは使用しない。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DB = "valueos_case_reg_settlement_spec_test";
const MIG = "supabase/migrations/20260801160000_case_registration_settlement_spec.sql";
const TYPES = "lib/caseSettlementTypes.ts";

const dealer = "11111111-1111-1111-1111-111111111111";
const product = "33333333-3333-3333-3333-333333333333";

let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function psql(sql, db = DB) {
  return execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-q", "-c", sql],
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
  if (!asRole) return parseJsonLine(psql(sql));
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

function basePayload(overrides = {}) {
  const { case: caseOverride, lines, settlement, request_id, ...rest } = overrides;
  return {
    request_id: request_id || randomUUID(),
    case: {
      dealer_id: dealer,
      customer_name: "決済テスト顧客",
      site_address: "東京都テスト1-1",
      order_received_date: "2026-07-26",
      ...(caseOverride || {}),
    },
    settlement: settlement || { settlement_type: "売掛" },
    lines: lines || [
      {
        line_type: "PRODUCT",
        product_id: product,
        quantity: 1,
      },
    ],
    ...rest,
  };
}

function settlementRow(caseId) {
  const raw = psql(`
    SELECT coalesce(settlement_type,'') || '|' ||
           coalesce(finance_company,'') || '|' ||
           coalesce(approval_number,'') || '|' ||
           coalesce(card_brand,'')
    FROM case_settlements WHERE case_id='${caseId}';
  `);
  const [settlement_type, finance_company, approval_number, card_brand] = raw.split("|");
  return { settlement_type, finance_company, approval_number, card_brand, raw };
}

// ---------- static ----------
const mig = readFileSync(join(ROOT, MIG), "utf8");
assert("migration file exists", existsSync(join(ROOT, MIG)));
assert("SECURITY INVOKER", /SECURITY\s+INVOKER/i.test(mig));
assert("no SECURITY DEFINER", !/SECURITY\s+DEFINER/i.test(mig));
assert("formal types in RPC", /'前金',\s*'売掛',\s*'3社間決済',\s*'カード'/.test(mig));
assert("rejects non-formal via NOT IN", /NOT IN\s*\(\s*'前金'/.test(mig));
assert("requires finance_company for 3社間", mig.includes("信販会社名は必須です"));
assert("requires approval_number for 3社間", mig.includes("承認番号は必須です"));
assert("requires card_brand for カード", mig.includes("カード会社名は必須です"));
assert("inserts finance columns", /INSERT INTO public\.case_settlements\s*\([\s\S]*finance_company[\s\S]*approval_number[\s\S]*card_brand/i.test(mig));
assert("GRANT service_role only pattern", /GRANT EXECUTE ON FUNCTION public\.create_case_registration\(jsonb\) TO service_role/i.test(mig));
assert("REVOKE anon", /REVOKE ALL ON FUNCTION public\.create_case_registration\(jsonb\) FROM anon/i.test(mig));
assert("REVOKE authenticated", /REVOKE ALL ON FUNCTION public\.create_case_registration\(jsonb\) FROM authenticated/i.test(mig));
assert("no UPDATE existing settlements", !/UPDATE\s+public\.case_settlements\b/i.test(mig));
assert("no DELETE settlements", !/DELETE\s+FROM\s+public\.case_settlements\b/i.test(mig));
assert("no CHECK constraint added", !/ADD\s+CONSTRAINT/i.test(mig));
assert("no ALTER TABLE business DDL", !/ALTER\s+TABLE\s+public\./i.test(mig));

const typesSrc = readFileSync(join(ROOT, TYPES), "utf8");
assert("types export CASE_REGISTRATION_SETTLEMENT_TYPES", typesSrc.includes("CASE_REGISTRATION_SETTLEMENT_TYPES"));
assert("types formal four", ["前金", "売掛", "3社間決済", "カード"].every((t) => typesSrc.includes(`"${t}"`)));
assert("types keep その他 for existing rows", typesSrc.includes('"その他"'));
assert("types payload has finance_company", typesSrc.includes("finance_company"));
assert("types payload has approval_number", typesSrc.includes("approval_number"));
assert("types payload has card_brand", typesSrc.includes("card_brand"));

const dealerDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", "app/dealer"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

// ---------- isolation DB ----------
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

for (const f of [
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
]) {
  psqlFile(join(ROOT, "supabase/migrations", f));
}

psql(`
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  REVOKE ALL ON FUNCTION public.create_case_registration(jsonb) FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.create_case_registration(jsonb) TO service_role;
  REVOKE ALL ON TABLE public.case_registration_requests FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.case_registration_requests TO service_role;
`);

// privileges
{
  assert(
    "anon cannot execute",
    psql(`SELECT has_function_privilege('anon', 'public.create_case_registration(jsonb)', 'EXECUTE');`) === "f" &&
      callRpc(basePayload(), "anon").ok_exec === false
  );
  assert(
    "authenticated cannot execute",
    psql(`SELECT has_function_privilege('authenticated', 'public.create_case_registration(jsonb)', 'EXECUTE');`) === "f" &&
      callRpc(basePayload(), "authenticated").ok_exec === false
  );
  const svc = callRpc(basePayload(), "service_role");
  assert(
    "service_role can execute",
    psql(`SELECT has_function_privilege('service_role', 'public.create_case_registration(jsonb)', 'EXECUTE');`) === "t" &&
      svc.ok_exec === true &&
      svc.result.ok === true,
    JSON.stringify(svc).slice(0, 300)
  );
}

// SECURITY INVOKER on live function
{
  const invoker = psql(`
    SELECT prosecdef = false
    FROM pg_proc
    WHERE proname = 'create_case_registration'
      AND pronamespace = 'public'::regnamespace;
  `);
  assert("live function is SECURITY INVOKER", invoker === "t", invoker);
}

// reject legacy / その他
for (const [label, type] of [
  ["その他", "その他"],
  ["掛売", "掛売"],
  ["ローン", "ローン"],
  ["三社間決済", "三社間決済"],
  ["現金", "現金"],
  ["empty", ""],
]) {
  const r = callRpc(basePayload({ request_id: randomUUID(), settlement: { settlement_type: type } }));
  assert(
    `reject ${label}`,
    r.ok === false && r.error_code === "INVALID_INPUT" && /決済区分/.test(r.error_message || ""),
    JSON.stringify(r)
  );
}

// 前金 / 売掛 success, extras nulled
{
  const r = callRpc(basePayload({
    request_id: randomUUID(),
    settlement: {
      settlement_type: "前金",
      finance_company: "ignored",
      approval_number: "ignored",
      card_brand: "ignored",
    },
  }));
  const row = settlementRow(r.case_id);
  assert("前金 ok", r.ok === true, JSON.stringify(r));
  assert("前金 extras null", row.raw === "前金|||", row.raw);
}
{
  const r = callRpc(basePayload({ request_id: randomUUID(), settlement: { settlement_type: "売掛" } }));
  const row = settlementRow(r.case_id);
  assert("売掛 ok", r.ok === true && row.raw === "売掛|||", JSON.stringify({ r, row }));
}

// 3社間 validation
{
  const r1 = callRpc(basePayload({
    request_id: randomUUID(),
    settlement: { settlement_type: "3社間決済", approval_number: "A-1" },
  }));
  assert("3社間 missing finance_company", r1.ok === false && /信販会社名/.test(r1.error_message || ""), JSON.stringify(r1));

  const r2 = callRpc(basePayload({
    request_id: randomUUID(),
    settlement: { settlement_type: "3社間決済", finance_company: "オリコ" },
  }));
  assert("3社間 missing approval_number", r2.ok === false && /承認番号/.test(r2.error_message || ""), JSON.stringify(r2));

  const r3 = callRpc(basePayload({
    request_id: randomUUID(),
    settlement: {
      settlement_type: "3社間決済",
      finance_company: "  ",
      approval_number: "A-1",
    },
  }));
  assert("3社間 blank finance_company", r3.ok === false && /信販会社名/.test(r3.error_message || ""), JSON.stringify(r3));

  const r4 = callRpc(basePayload({
    request_id: randomUUID(),
    settlement: {
      settlement_type: "3社間決済",
      finance_company: "オリコ",
      approval_number: "AP-100",
      card_brand: "should-null",
    },
  }));
  const row = settlementRow(r4.case_id);
  assert("3社間 ok", r4.ok === true, JSON.stringify(r4));
  assert("3社間 persists + card null", row.raw === "3社間決済|オリコ|AP-100|", row.raw);
}

// カード validation
{
  const r1 = callRpc(basePayload({
    request_id: randomUUID(),
    settlement: { settlement_type: "カード" },
  }));
  assert("カード missing brand", r1.ok === false && /カード会社名/.test(r1.error_message || ""), JSON.stringify(r1));

  const r2 = callRpc(basePayload({
    request_id: randomUUID(),
    settlement: {
      settlement_type: "カード",
      card_brand: "VISA",
      finance_company: "should-null",
      approval_number: "should-null",
    },
  }));
  const row = settlementRow(r2.case_id);
  assert("カード ok", r2.ok === true, JSON.stringify(r2));
  assert("カード persists + finance null", row.raw === "カード|||VISA", row.raw);
}

// existing その他 row untouched
{
  const legacyCaseId = randomUUID();
  const legacySettlementId = randomUUID();
  psql(`
    INSERT INTO cases (id, case_no, dealer_id, customer_name, site_address, status)
    VALUES ('${legacyCaseId}', 'LEGACY-SONOTA', '${dealer}', '既存その他', '住所', '新規受付');
    INSERT INTO case_settlements (
      id, case_id, settlement_type, fee_amount, finance_company, approval_number, card_brand, memo
    ) VALUES (
      '${legacySettlementId}', '${legacyCaseId}', 'その他', 0, 'keep-fc', 'keep-ap', 'keep-cb', 'keep-memo'
    );
  `);
  const before = psql(`
    SELECT settlement_type || '|' || coalesce(finance_company,'') || '|' ||
           coalesce(approval_number,'') || '|' || coalesce(card_brand,'') || '|' || coalesce(memo,'')
    FROM case_settlements WHERE id='${legacySettlementId}';
  `);
  const r = callRpc(basePayload({ request_id: randomUUID(), settlement: { settlement_type: "売掛" } }));
  const after = psql(`
    SELECT settlement_type || '|' || coalesce(finance_company,'') || '|' ||
           coalesce(approval_number,'') || '|' || coalesce(card_brand,'') || '|' || coalesce(memo,'')
    FROM case_settlements WHERE id='${legacySettlementId}';
  `);
  assert("legacy その他 unchanged", r.ok === true && before === after && before.startsWith("その他|"), `${before} vs ${after}`);
}

// idempotency still works with settlement detail
{
  const rid = randomUUID();
  const p = basePayload({
    request_id: rid,
    settlement: {
      settlement_type: "3社間決済",
      finance_company: "アプラス",
      approval_number: "Z-9",
    },
  });
  const r1 = callRpc(p);
  const r2 = callRpc(p);
  assert(
    "idempotent with settlement detail",
    r1.ok && r2.ok && r2.idempotent_replay === true && r1.case_id === r2.case_id,
    JSON.stringify({ r1, r2 })
  );
}

// XOR / qty still enforced
{
  const r = callRpc(basePayload({
    request_id: randomUUID(),
    lines: [{ line_type: "PRODUCT", product_id: product, package_id: product, quantity: 1 }],
  }));
  assert("XOR still rejected", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}
{
  const r = callRpc(basePayload({
    request_id: randomUUID(),
    lines: [{ line_type: "PRODUCT", product_id: product, quantity: 0 }],
  }));
  assert("qty still rejected", r.ok === false && r.error_code === "INVALID_INPUT", JSON.stringify(r));
}

console.log(failed === 0 ? "\nALL_TESTS_PASSED" : `\nFAILED_COUNT=${failed}`);
process.exit(failed === 0 ? 0 : 1);
