import type { SupabaseClient } from "@supabase/supabase-js";

import type { MasterKind } from "@/lib/masters/masterKinds";

export type { MasterKind } from "@/lib/masters/masterKinds";

export type MasterDeleteResult =
  | { ok: true }
  | {
      ok: false;
      error_code: "NOT_FOUND" | "IN_USE" | "CONFIG_ERROR" | "DELETE_FAILED";
      error_message: string;
    };

async function adminDb(
  client?: SupabaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (client) return client;
  const { getServiceRoleSupabase } = await import("@/lib/supabase/serverAdmin");
  return getServiceRoleSupabase();
}

function isConfigError(e: unknown): boolean {
  return Boolean(
    e &&
      typeof e === "object" &&
      "name" in e &&
      (e as { name: string }).name === "ServerAdminConfigError"
  );
}

async function countEq(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  table: string,
  column: string,
  id: string
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, id);
  if (error) throw error;
  return count ?? 0;
}

/** Migration 未適用などでテーブルが無い場合は 0（削除判定を止めない） */
async function countEqOptionalTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  table: string,
  column: string,
  id: string
): Promise<number> {
  try {
    return await countEq(db, table, column, id);
  } catch (e) {
    const message = String(
      (e as { message?: string } | null)?.message || e || ""
    ).toLowerCase();
    const code = String((e as { code?: string } | null)?.code || "");
    if (
      code === "42P01" ||
      code === "PGRST205" ||
      message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("schema cache")
    ) {
      return 0;
    }
    throw e;
  }
}

function inUse(label: string): MasterDeleteResult {
  return {
    ok: false,
    error_code: "IN_USE",
    error_message: `${label}で使用されているため削除できません`,
  };
}

export async function deleteDealerMaster(
  id: string,
  client?: SupabaseClient
): Promise<MasterDeleteResult> {
  try {
    const db = await adminDb(client);
    const { data: row, error } = await db
      .from("dealers")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      return {
        ok: false,
        error_code: "NOT_FOUND",
        error_message: "販売店が見つかりません",
      };
    }

    if ((await countEq(db, "cases", "dealer_id", id)) > 0) {
      return inUse("案件");
    }
    if ((await countEq(db, "sales_prices", "dealer_id", id)) > 0) {
      return inUse("販売価格");
    }
    // 3社間: dealer_settlements.dealer_id ON DELETE RESTRICT（Migration 未適用時は skip）
    if (
      (await countEqOptionalTable(db, "dealer_settlements", "dealer_id", id)) >
      0
    ) {
      return inUse("仕切清算");
    }

    const { error: delError } = await db.from("dealers").delete().eq("id", id);
    if (delError) {
      return {
        ok: false,
        error_code: "DELETE_FAILED",
        error_message: delError.message || "削除に失敗しました",
      };
    }
    return { ok: true };
  } catch (e) {
    if (isConfigError(e)) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      };
    }
    return {
      ok: false,
      error_code: "DELETE_FAILED",
      error_message: "削除に失敗しました",
    };
  }
}

export async function deleteContractorMaster(
  id: string,
  client?: SupabaseClient
): Promise<MasterDeleteResult> {
  try {
    const db = await adminDb(client);
    const { data: row, error } = await db
      .from("contractors")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      return {
        ok: false,
        error_code: "NOT_FOUND",
        error_message: "施工店が見つかりません",
      };
    }

    const { error: delError } = await db
      .from("contractors")
      .delete()
      .eq("id", id);
    if (delError) {
      return {
        ok: false,
        error_code: "DELETE_FAILED",
        error_message: delError.message || "削除に失敗しました",
      };
    }
    return { ok: true };
  } catch (e) {
    if (isConfigError(e)) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      };
    }
    return {
      ok: false,
      error_code: "DELETE_FAILED",
      error_message: "削除に失敗しました",
    };
  }
}

export async function deleteManufacturerMaster(
  id: string,
  client?: SupabaseClient
): Promise<MasterDeleteResult> {
  try {
    const db = await adminDb(client);
    const { data: row, error } = await db
      .from("manufacturers")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      return {
        ok: false,
        error_code: "NOT_FOUND",
        error_message: "メーカーが見つかりません",
      };
    }

    if ((await countEq(db, "product_series", "manufacturer_id", id)) > 0) {
      return inUse("シリーズ");
    }
    if ((await countEq(db, "products", "manufacturer_id", id)) > 0) {
      return inUse("商品");
    }
    if ((await countEq(db, "packages", "manufacturer_id", id)) > 0) {
      return inUse("パッケージ");
    }

    const { error: delError } = await db
      .from("manufacturers")
      .delete()
      .eq("id", id);
    if (delError) {
      return {
        ok: false,
        error_code: "DELETE_FAILED",
        error_message: delError.message || "削除に失敗しました",
      };
    }
    return { ok: true };
  } catch (e) {
    if (isConfigError(e)) {
      return {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      };
    }
    return {
      ok: false,
      error_code: "DELETE_FAILED",
      error_message: "削除に失敗しました",
    };
  }
}

export async function deleteMasterByKind(
  kind: MasterKind,
  id: string,
  client?: SupabaseClient
): Promise<MasterDeleteResult> {
  switch (kind) {
    case "dealer":
      return deleteDealerMaster(id, client);
    case "contractor":
      return deleteContractorMaster(id, client);
    case "manufacturer":
      return deleteManufacturerMaster(id, client);
    default:
      return {
        ok: false,
        error_code: "NOT_FOUND",
        error_message: "対象が見つかりません",
      };
  }
}
