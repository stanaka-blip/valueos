#!/usr/bin/env node
/**
 * Apply PR27 cases.order_received_date DDL + backfill.
 *
 * Requires:
 *   DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node scripts/apply-cases-order-received-date-ddl.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = join(
  root,
  "supabase/migrations/20260726160000_cases_order_received_date.sql"
);
const sql = readFileSync(sqlPath, "utf8");
const dbUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  "";

if (!dbUrl) {
  console.error(
    [
      "DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL が未設定です。",
      "",
      "適用方法:",
      "1) Supabase Dashboard → SQL Editor で次のファイルを実行",
      `   ${sqlPath}`,
      "2) または DATABASE_URL を渡して再実行",
    ].join("\n")
  );
  process.exit(2);
}

const psql = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
});

if (psql.error) {
  console.error("psql が見つかりません。SQL Editor で手動適用してください。");
  console.error(psql.error.message);
  process.exit(1);
}

if (psql.status !== 0) {
  console.error(psql.stderr || psql.stdout);
  process.exit(psql.status ?? 1);
}

console.log("Applied:", sqlPath);
console.log(psql.stdout);
