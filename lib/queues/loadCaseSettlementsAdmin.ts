import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

/** 社内キュー共通の決済行（service_role 読取） */
export type QueueSettlementRow = {
  case_id: string;
  settlement_type: string | null;
  deposit_amount: number | null;
  loan_status: string | null;
  card_status: string | null;
  approval_number?: string | null;
  memo: string | null;
};

export type LoadAllCaseSettlementsAdminResult =
  | { ok: true; data: QueueSettlementRow[] }
  | { ok: false; error: string };

/**
 * case_settlements を service_role で一括取得。
 * RLS で空配列になる anon 取得の代替。失敗は未設定へフォールバックしない。
 * client 注入はテスト用（本番は getServiceRoleSupabase）。
 */
export async function loadAllCaseSettlementsAdmin(options?: {
  includeApprovalNumber?: boolean;
  client?: SupabaseClient<Database>;
}): Promise<LoadAllCaseSettlementsAdminResult> {
  try {
    const client = options?.client ?? getServiceRoleSupabase();
    const columns = options?.includeApprovalNumber
      ? "case_id, settlement_type, deposit_amount, loan_status, card_status, approval_number, memo"
      : "case_id, settlement_type, deposit_amount, loan_status, card_status, memo";

    const { data, error } = await client
      .from("case_settlements")
      .select(columns);

    if (error) {
      return {
        ok: false,
        error: `決済条件の取得に失敗しました：${error.message}`,
      };
    }

    return {
      ok: true,
      data: (data || []) as unknown as QueueSettlementRow[],
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return { ok: false, error: "サーバー設定が完了していません" };
    }
    return { ok: false, error: "決済条件の取得に失敗しました" };
  }
}
