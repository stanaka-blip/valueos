import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ブラウザ用 Auth クライアント（publishable のみ）。
 * invite コールバックの setSession / verifyOtp / updateUser 用。
 * service_role は使わない。ValueOS staff cookie は発行しない。
 */
export function createBrowserAuthClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase Auth 設定が完了していません");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  });
}
