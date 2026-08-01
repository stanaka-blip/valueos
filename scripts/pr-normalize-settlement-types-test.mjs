/**
 * settlement_type 正規化 Migration の隔離DB + 静的テスト。
 * Run: node scripts/pr-normalize-settlement-types-test.mjs
 * 本番DBは使用しない。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DB = "valueos_normalize_settlement_types_test";
const MIG = "supabase/migrations/20260801150000_normalize_case_settlement_types.sql";

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
assert("migration exists", existsSync(join(ROOT, MIG)));
const mig = readFileSync(join(ROOT, MIG), "utf8");
assert("maps 掛売 to 売掛", /掛売/.test(mig) && /売掛/.test(mig));
assert("maps ローン/三社間決済 to 3社間決済", mig.includes("'3社間決済'") && mig.includes("'ローン'"));
assert("does not rewrite その他", !/その他'\s*,|その他"\s*,/.test(mig) && !/settlement_type\s*=\s*'その他'/.test(mig));
assert("no CHECK constraint", !/\bCHECK\s*\(/i.test(mig) && !/ADD\s+CONSTRAINT/i.test(mig));
assert("no DELETE", !/DELETE\s+FROM\s+public\.case_settlements/i.test(mig));
assert("disables updated_at trigger", mig.includes("DISABLE TRIGGER case_settlements_set_updated_at"));
assert("re-enables updated_at trigger", mig.includes("ENABLE TRIGGER case_settlements_set_updated_at"));
assert("no RPC replace", !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_case_registration/i.test(mig));

const rules = readFileSync(join(ROOT, "lib/workflow/settlementRules.ts"), "utf8");
assert("workflow formal key 3社間決済", rules.includes('"3社間決済"') && rules.includes('key: "3社間決済"'));
assert("workflow keeps ローン alias", rules.includes('"ローン"') || rules.includes("'ローン'"));
assert("workflow keeps 掛売 alias under 売掛", /aliases:\s*\[[^\]]*掛売/.test(rules));
assert("workflow keeps 三社間決済 alias", rules.includes("三社間決済"));

const dealerDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", "app/dealer"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert("dealer diff empty", (dealerDiff.stdout || "").trim() === "", dealerDiff.stdout);

const forbiddenDiff = spawnSync(
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
    "supabase/migrations/20260801140000_case_settlements_finance_detail_columns.sql",
  ],
  { cwd: ROOT, encoding: "utf8" }
);
assert("no registration/detail/rpc/gateway changes", (forbiddenDiff.stdout || "").trim() === "", forbiddenDiff.stdout);

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
    finance_company text,
    approval_number text,
    memo text
  );
  CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $fn$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $fn$;
  CREATE TRIGGER case_settlements_set_updated_at
    BEFORE UPDATE ON public.case_settlements
    FOR EACH ROW
    EXECUTE FUNCTION public.valueos_set_updated_at();
`);

const seeds = [
  ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "掛売", "memo-kakeuri", "BRAND1"],
  ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "ローン", "memo-loan", "BRAND2"],
  ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", "三社間決済", "memo-sansha", null],
  ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4", "前金", "memo-mae", null],
  ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5", "売掛", "memo-urikake", null],
  ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6", "カード", "memo-card", "AMEX"],
  ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7", "その他", "memo-other", null],
];

for (let i = 0; i < seeds.length; i++) {
  const [sid, stype, memo, brand] = seeds[i];
  const cid = `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb${i + 1}`;
  const brandSql = brand === null ? "NULL" : `'${brand}'`;
  psql(`
    INSERT INTO public.cases (id, case_no) VALUES ('${cid}', 'C-${i + 1}');
    INSERT INTO public.case_settlements (
      id, case_id, settlement_type, fee_amount, card_brand, finance_company, approval_number, memo, updated_at
    ) VALUES (
      '${sid}', '${cid}', '${stype}', ${100 + i}, ${brandSql}, NULL, NULL, '${memo}',
      '2026-01-01 00:00:00+00'
    );
  `);
}

const beforeCount = psql(`SELECT count(*)::text FROM public.case_settlements;`);
const beforeDist = psql(`
  SELECT string_agg(settlement_type || ':' || cnt::text, ',' ORDER BY settlement_type)
  FROM (
    SELECT settlement_type, count(*)::int AS cnt
    FROM public.case_settlements
    GROUP BY settlement_type
  ) s;
`);
const beforeOtherFp = psql(`
  SELECT md5(concat_ws('|',
    id::text, case_id::text, settlement_type, coalesce(fee_amount::text,''),
    coalesce(card_brand,''), coalesce(memo,''), coalesce(updated_at::text,'')
  ))
  FROM public.case_settlements WHERE settlement_type='その他';
`);
const beforeNonTypeFp = psql(`
  SELECT md5(string_agg(fp, '' ORDER BY fp))
  FROM (
    SELECT md5(concat_ws('|',
      id::text, case_id::text, coalesce(fee_amount::text,''),
      coalesce(card_brand,''), coalesce(finance_company,''),
      coalesce(approval_number,''), coalesce(memo,''), coalesce(updated_at::text,'')
    )) AS fp
    FROM public.case_settlements
  ) s;
`);

psqlFile(join(ROOT, MIG));
psqlFile(join(ROOT, MIG)); // re-apply

const afterCount = psql(`SELECT count(*)::text FROM public.case_settlements;`);
const afterDist = psql(`
  SELECT string_agg(settlement_type || ':' || cnt::text, ',' ORDER BY settlement_type)
  FROM (
    SELECT settlement_type, count(*)::int AS cnt
    FROM public.case_settlements
    GROUP BY settlement_type
  ) s;
`);
const afterOtherFp = psql(`
  SELECT md5(concat_ws('|',
    id::text, case_id::text, settlement_type, coalesce(fee_amount::text,''),
    coalesce(card_brand,''), coalesce(memo,''), coalesce(updated_at::text,'')
  ))
  FROM public.case_settlements WHERE settlement_type='その他';
`);
const afterNonTypeFp = psql(`
  SELECT md5(string_agg(fp, '' ORDER BY fp))
  FROM (
    SELECT md5(concat_ws('|',
      id::text, case_id::text, coalesce(fee_amount::text,''),
      coalesce(card_brand,''), coalesce(finance_company,''),
      coalesce(approval_number,''), coalesce(memo,''), coalesce(updated_at::text,'')
    )) AS fp
    FROM public.case_settlements
  ) s;
`);

const mapped = psql(`
  SELECT string_agg(id::text || '>' || settlement_type, ',' ORDER BY id)
  FROM public.case_settlements
  WHERE id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'
  );
`);

assert("row count unchanged", beforeCount === afterCount && afterCount === "7", `${beforeCount}→${afterCount}`);
assert(
  "掛売→売掛, ローン/三社間→3社間決済, others kept",
  mapped.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1>売掛") &&
    mapped.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2>3社間決済") &&
    mapped.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3>3社間決済") &&
    mapped.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4>前金") &&
    mapped.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5>売掛") &&
    mapped.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6>カード") &&
    mapped.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7>その他"),
  mapped
);
assert("no remaining 掛売/ローン/三社間決済", psql(`
  SELECT count(*)::text FROM public.case_settlements
  WHERE settlement_type IN ('掛売','ローン','三社間決済');
`) === "0");
assert(
  "distribution after",
  afterDist === "3社間決済:2,その他:1,カード:1,前金:1,売掛:2",
  `${beforeDist} → ${afterDist}`
);
assert("その他 fingerprint unchanged", beforeOtherFp === afterOtherFp, `${beforeOtherFp} vs ${afterOtherFp}`);
assert(
  "non-settlement_type values unchanged (incl updated_at)",
  beforeNonTypeFp === afterNonTypeFp,
  `${beforeNonTypeFp} vs ${afterNonTypeFp}`
);
assert("その他 count still 1", psql(`SELECT count(*)::text FROM public.case_settlements WHERE settlement_type='その他';`) === "1");

execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${DB};`], {
  encoding: "utf8",
});

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL NORMALIZE SETTLEMENT TYPE TESTS PASSED");
console.log("BEFORE_DIST", beforeDist);
console.log("AFTER_DIST", afterDist);
