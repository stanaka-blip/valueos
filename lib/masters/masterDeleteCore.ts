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
    error_message: `このマスタは既存データ（${label}）で使用されているため削除できません。利用停止してください。`,
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

/**
 * パッケージ物理削除（未使用時のみ）。
 * DB RPC `delete_unused_package` で FOR UPDATE → 参照確認 →
 * package_items / packages 削除を同一トランザクションで実行する。
 * 途中失敗時は package_items も ROLLBACK（partial failure 禁止）。
 * 新規 CASCADE 追加はしない。価格履歴・案件履歴は削除しない。
 */
export function parseDeleteUnusedPackageRpcResult(
  data: unknown
): MasterDeleteResult {
  const raw = (data || {}) as {
    ok?: unknown;
    error_code?: unknown;
    error_message?: unknown;
  };
  if (raw.ok === true) return { ok: true };

  const code = typeof raw.error_code === "string" ? raw.error_code : "";
  const message =
    typeof raw.error_message === "string" && raw.error_message.trim()
      ? raw.error_message
      : "削除に失敗しました";

  if (code === "NOT_FOUND" || code === "IN_USE" || code === "DELETE_FAILED") {
    return {
      ok: false,
      error_code: code,
      error_message: message,
    };
  }
  return {
    ok: false,
    error_code: "DELETE_FAILED",
    error_message: message,
  };
}

export async function deletePackageMaster(
  id: string,
  client?: SupabaseClient
): Promise<MasterDeleteResult> {
  try {
    const db = await adminDb(client);
    const { data, error } = await db.rpc("delete_unused_package", {
      p_package_id: id,
    });
    if (error) {
      const message = String(error.message || "").toLowerCase();
      const code = String(error.code || "");
      // Migration 未適用時は明確に案内（途中削除は発生しない）
      if (
        code === "PGRST202" ||
        message.includes("could not find the function") ||
        message.includes("delete_unused_package")
      ) {
        return {
          ok: false,
          error_code: "CONFIG_ERROR",
          error_message:
            "パッケージ削除RPCが未適用です。管理者に migration 適用を依頼してください。",
        };
      }
      return {
        ok: false,
        error_code: "DELETE_FAILED",
        error_message: error.message || "削除に失敗しました",
      };
    }
    return parseDeleteUnusedPackageRpcResult(data);
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
    case "package":
      return deletePackageMaster(id, client);
    default:
      return {
        ok: false,
        error_code: "NOT_FOUND",
        error_message: "対象が見つかりません",
      };
  }
}
