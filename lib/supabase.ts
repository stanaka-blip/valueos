import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * 既存画面向けクライアント。
 * Database ジェネリクスは付けない（既存の緩い select/insert を壊さないため）。
 *
 * Vercel Preview などで NEXT_PUBLIC_SUPABASE_* が未設定のまま
 * `next build` の page data collection が走ると createClient が
 * "supabaseUrl is required" で落ちる。空のときはプレースホルダを使い、
 * ビルド自体は通す（実行時に実値が無い場合は API 呼び出しが失敗する）。
 */
function resolveSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return url && url.length > 0 ? url : "https://placeholder.supabase.co";
}

function resolveSupabaseKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return key && key.length > 0
    ? key
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";
}

export const supabase = createClient(
  resolveSupabaseUrl(),
  resolveSupabaseKey()
);

/** Phase1 Repository 向けの型付きクライアント */
export type ValueOsSupabaseClient = SupabaseClient<Database>;

export function getTypedSupabase(): ValueOsSupabaseClient {
  return supabase as ValueOsSupabaseClient;
}
