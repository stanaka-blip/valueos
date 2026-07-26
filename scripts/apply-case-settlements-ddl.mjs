#!/usr/bin/env node
/**
 * Apply case_settlements DDL to the linked Postgres database.
 *
 * Requires one of:
 *   DATABASE_URL
 *   SUPABASE_DB_URL
 *   POSTGRES_URL
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node scripts/apply-case-settlements-ddl.mjs
 *
 * If no URL is set, prints the SQL path for Supabase SQL Editor.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = join(
  root,
  "supabase/migrations/20260724160000_create_case_settlements.sql"
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
      "この環境の .env.local には anon キーのみあり、DDL は実行できません。",
      "",
      "適用方法:",
      "1) Supabase Dashboard → SQL Editor で次のファイルを実行",
      `   ${sqlPath}`,
      "2) または DATABASE_URL を渡して再実行",
      "   DATABASE_URL='postgresql://...' node scripts/apply-case-settlements-ddl.mjs",
    ].join("\n")
  );
  process.exit(2);
}

const psql = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
});

if (psql.error) {
  console.error(
    "psql が見つかりません。SQL Editor で手動適用するか、psql をインストールしてください。"
  );
  console.error(psql.error.message);
  process.exit(1);
}

if (psql.status !== 0) {
  console.error(psql.stderr || psql.stdout);
  process.exit(psql.status ?? 1);
}

console.log("Applied:", sqlPath);
console.log(psql.stdout);
