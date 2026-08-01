import type { SupabaseClient } from "@supabase/supabase-js";

import type { CaseSettlementRow, Database } from "@/lib/database.types";

export type AdminSettlementReadResult =
  | { ok: true; data: CaseSettlementRow | null }
  | {
      ok: false;
      error_code: "CONFIG_ERROR" | "SETTLEMENT_READ_FAILED";
      error_message: string;
    };

/** service_role クライアントで case_settlements を取得（注入可能） */
export async function getCaseSettlementByCaseIdWithClient(
  caseId: string,
  client: SupabaseClient<Database>
): Promise<AdminSettlementReadResult> {
  const { data, error } = await client
    .from("case_settlements")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error_code: "SETTLEMENT_READ_FAILED",
      error_message: "決済条件の取得に失敗しました",
    };
  }

  return { ok: true, data: data ?? null };
}
