import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export class ServerAdminConfigError extends Error {
  constructor(message = "サーバー設定が完了していません") {
    super(message);
    this.name = "ServerAdminConfigError";
  }
}

/**
 * service role 専用クライアント。ブラウザ・クライアントコンポーネントから import しないこと。
 * 初期化は実行時のみ（build 時に秘密を要求しない）。
 */
export function getServiceRoleSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ServerAdminConfigError();
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
