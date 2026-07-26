import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * 既存画面向けクライアント。
 * Database ジェネリクスは付けない（既存の緩い select/insert を壊さないため）。
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

/** Phase1 Repository 向けの型付きクライアント */
export type ValueOsSupabaseClient = SupabaseClient<Database>;

export function getTypedSupabase(): ValueOsSupabaseClient {
  return supabase as ValueOsSupabaseClient;
}
