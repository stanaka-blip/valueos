/**
 * case_settlements finance_company / approval_number 追加 Migration の隔離DB + 静的テスト。
 * Run: node scripts/pr-case-settlements-finance-columns-test.mjs
 * 本番DBは使用しない。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DB = "valueos_case_settlements_finance_cols_test";
const MIG = "supabase/migrations/20260801140000_case_settlements_finance_detail_columns.sql";

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

// ---------- static ----------
const mig = readFileSync(join(ROOT, MIG), "utf8");
assert("migration file exists", existsSync(join(ROOT, MIG)));
assert("adds finance_company", /ADD COLUMN IF NOT EXISTS finance_company text/i.test(mig));
assert("adds approval_number", /ADD COLUMN IF NOT EXISTS approval_number text/i.test(mig));
assert("updates card_brand comment", mig.includes("カード会社名として利用"));
assert("no UPDATE business rows", !/UPDATE\s+public\.case_settlements\b/i.test(mig));
assert("no DELETE business rows", !/DELETE\s+FROM\s+public\.case_settlements\b/i.test(mig));
assert("no settlement_type rewrite", !/settlement_type\s*=/.test(mig));
assert("no CHECK constraint", !/\bCHECK\s*\(/i.test(mig) && !/ADD\s+CONSTRAINT/i.test(mig));
assert("no RPC replace", !/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(mig));
assert("no GRANT/REVOKE", !/\b(GRANT|REVOKE)\b/i.test(mig));

const types = readFileSync(join(ROOT, "lib/database.types.ts"), "utf8");
assert("types have finance_company", types.includes("finance_company: string | null"));
assert("types have approval_number", types.includes("approval_number: string | null"));
assert("types Insert optional finance_company", types.includes("finance_company?: string | null"));
assert("types Insert optional approval_number", types.includes("approval_number?: string | null"));

const dealerDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", "app/dealer"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

const scopeDiff = spawnSync(
  "git",
  [
    "diff",
    "--name-only",
    "origin/main",
    "--",
    "app/components/case-registration",
    "app/cases",
    "lib/cases",
    "lib/gateway",
    "app/api",
    "supabase/migrations/20260801090000_case_registration_nullable_prices.sql",
  ],
  { cwd: ROOT, encoding: "utf8" }
);
assert("no RPC/UI/gateway changes vs main", (scopeDiff.stdout || "").trim() === "", scopeDiff.stdout);

// ---------- isolation DB ----------
execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${DB};`], {
  encoding: "utf8",
});
execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${DB};`], {
  encoding: "utf8",
});

psql(`
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE TABLE public.cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_no text
  );
  CREATE TABLE public.case_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    case_id uuid NOT NULL UNIQUE REFERENCES public.cases(id) ON DELETE CASCADE,
    settlement_type text NOT NULL,
    fee_rate numeric,
    fee_amount numeric NOT NULL DEFAULT 0,
    deposit_rate numeric,
    deposit_amount numeric,
    payment_terms text,
    card_brand text,
    memo text
  );
  COMMENT ON COLUMN public.case_settlements.card_brand IS 'カードブランド';
`);

const caseId = "11111111-1111-1111-1111-111111111111";
const settlementId = "22222222-2222-2222-2222-222222222222";
psql(`
  INSERT INTO public.cases (id, case_no) VALUES ('${caseId}', 'CS-1');
  INSERT INTO public.case_settlements (id, case_id, settlement_type, fee_amount, card_brand, memo)
  VALUES ('${settlementId}', '${caseId}', 'その他', 0, 'VISA', 'keep-me');
`);

const beforeFp = psql(`
  SELECT md5(concat_ws('|',
    id::text, case_id::text, settlement_type, coalesce(card_brand,''), coalesce(memo,''), fee_amount::text
  ))
  FROM public.case_settlements WHERE id='${settlementId}';
`);
const beforeCount = psql(`SELECT count(*)::text FROM public.case_settlements;`);
const beforeOther = psql(`SELECT count(*)::text FROM public.case_settlements WHERE settlement_type='その他';`);

psqlFile(join(ROOT, MIG));
psqlFile(join(ROOT, MIG)); // re-apply

const cols = psql(`
  SELECT string_agg(column_name || ':' || is_nullable, ',' ORDER BY column_name)
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='case_settlements'
    AND column_name IN ('finance_company','approval_number','card_brand');
`);
assert(
  "columns nullable text",
  cols === "approval_number:YES,card_brand:YES,finance_company:YES",
  cols
);

const afterFp = psql(`
  SELECT md5(concat_ws('|',
    id::text, case_id::text, settlement_type, coalesce(card_brand,''), coalesce(memo,''), fee_amount::text
  ))
  FROM public.case_settlements WHERE id='${settlementId}';
`);
const afterCount = psql(`SELECT count(*)::text FROM public.case_settlements;`);
const afterOther = psql(`SELECT count(*)::text FROM public.case_settlements WHERE settlement_type='その他';`);
const nullNewCols = psql(`
  SELECT (finance_company IS NULL AND approval_number IS NULL)::text
  FROM public.case_settlements WHERE id='${settlementId}';
`);
const cardComment = psql(`
  SELECT col_description('public.case_settlements'::regclass, attnum)
  FROM pg_attribute
  WHERE attrelid='public.case_settlements'::regclass AND attname='card_brand';
`);

assert("existing fingerprint unchanged", beforeFp === afterFp, `${beforeFp} vs ${afterFp}`);
assert("row count unchanged", beforeCount === afterCount && afterCount === "1");
assert("その他 row kept", beforeOther === "1" && afterOther === "1");
assert("new columns NULL on existing row", nullNewCols === "true" || nullNewCols === "t", nullNewCols);
assert("card_brand comment updated", cardComment.includes("カード会社名として利用"), cardComment);

const insertOk = psql(`
  INSERT INTO public.cases (id, case_no) VALUES ('33333333-3333-3333-3333-333333333333', 'CS-2');
  INSERT INTO public.case_settlements (
    case_id, settlement_type, fee_amount, finance_company, approval_number, card_brand
  ) VALUES (
    '33333333-3333-3333-3333-333333333333', '3社間決済', 0, '信販A', 'AP-1', NULL
  )
  RETURNING finance_company || '|' || approval_number;
`);
assert("can insert finance detail", insertOk === "信販A|AP-1", insertOk);

execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${DB};`], {
  encoding: "utf8",
});

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL CASE SETTLEMENT FINANCE COLUMN TESTS PASSED");
