import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadStaffProfile } from "@/lib/auth/staffAuth";
import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

export type StaffListItem = {
  id: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  email_confirmed: boolean;
  created_at: string;
};

export type StaffAdminError = {
  ok: false;
  error_code: string;
  error_message: string;
};

function err(code: string, message: string): StaffAdminError {
  return { ok: false, error_code: code, error_message: message };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  if (email.length < 3 || email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function countActiveAdmins(
  client: SupabaseClient<Database>
): Promise<number> {
  const { count, error } = await client
    .from("staff_profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

async function buildEmailMap(
  client: SupabaseClient<Database>
): Promise<Map<string, { email: string | null; confirmed: boolean }>> {
  const map = new Map<string, { email: string | null; confirmed: boolean }>();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      map.set(u.id, {
        email: u.email ?? null,
        confirmed: Boolean(u.email_confirmed_at),
      });
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }
  return map;
}

export async function listStaffUsers(
  client: SupabaseClient<Database> = getServiceRoleSupabase()
): Promise<{ ok: true; staff: StaffListItem[] } | StaffAdminError> {
  try {
    const { data, error } = await client
      .from("staff_profiles")
      .select("id, display_name, is_active, is_admin, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      return err("LIST_FAILED", "ユーザー一覧の取得に失敗しました");
    }
    const emailMap = await buildEmailMap(client);
    const staff: StaffListItem[] = (data || []).map((row) => {
      const auth = emailMap.get(row.id);
      return {
        id: row.id,
        display_name: row.display_name,
        email: auth?.email ?? null,
        is_active: row.is_active,
        is_admin: row.is_admin === true,
        email_confirmed: auth?.confirmed ?? false,
        created_at: row.created_at,
      };
    });
    return { ok: true, staff };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return err("CONFIG_ERROR", "サーバー設定が完了していません");
    }
    return err("LIST_FAILED", "ユーザー一覧の取得に失敗しました");
  }
}

/**
 * 招待: Auth Admin invite → staff_profiles INSERT
 */
export async function inviteStaffUser(input: {
  email: string;
  displayName: string;
  isAdmin?: boolean;
  redirectTo?: string | null;
  client?: SupabaseClient<Database>;
}): Promise<{ ok: true; staff: StaffListItem } | StaffAdminError> {
  try {
    const client = input.client ?? getServiceRoleSupabase();
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    if (!isValidEmail(email)) {
      return err("INVALID_EMAIL", "メールアドレスが不正です");
    }
    if (!displayName || displayName.length > 80) {
      return err("INVALID_DISPLAY_NAME", "氏名を入力してください");
    }

    const { data: inviteData, error: inviteError } =
      await client.auth.admin.inviteUserByEmail(email, {
        data: { display_name: displayName },
        redirectTo: input.redirectTo || undefined,
      });

    if (inviteError || !inviteData.user?.id) {
      const msg = (inviteError?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        return err(
          "EMAIL_EXISTS",
          "このメールアドレスは既に登録されています"
        );
      }
      return err("INVITE_FAILED", "招待メールの送信に失敗しました");
    }

    const userId = inviteData.user.id;
    const { data: profile, error: profileError } = await client
      .from("staff_profiles")
      .upsert(
        {
          id: userId,
          display_name: displayName,
          is_active: true,
          is_admin: input.isAdmin === true,
        },
        { onConflict: "id" }
      )
      .select("id, display_name, is_active, is_admin, created_at")
      .single();

    if (profileError || !profile) {
      return err(
        "PROFILE_CREATE_FAILED",
        "招待は送信されましたがプロファイル作成に失敗しました。管理者に連絡してください"
      );
    }

    return {
      ok: true,
      staff: {
        id: profile.id,
        display_name: profile.display_name,
        email: inviteData.user.email || email,
        is_active: profile.is_active,
        is_admin: profile.is_admin === true,
        email_confirmed: Boolean(inviteData.user.email_confirmed_at),
        created_at: profile.created_at,
      },
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return err("CONFIG_ERROR", "サーバー設定が完了していません");
    }
    return err("INVITE_FAILED", "招待に失敗しました");
  }
}

export async function setStaffActive(input: {
  targetUserId: string;
  isActive: boolean;
  actorUserId: string;
  client?: SupabaseClient<Database>;
}): Promise<{ ok: true; staff_id: string; is_active: boolean } | StaffAdminError> {
  try {
    const client = input.client ?? getServiceRoleSupabase();
    if (!input.targetUserId) {
      return err("INVALID_USER", "ユーザーが不正です");
    }
    if (input.targetUserId === input.actorUserId && !input.isActive) {
      return err("CANNOT_DEACTIVATE_SELF", "自分自身は無効化できません");
    }

    const target = await loadStaffProfile(input.targetUserId);
    if (!target) {
      return err("NOT_FOUND", "ユーザーが見つかりません");
    }

    if (!input.isActive && target.is_admin && target.is_active) {
      const admins = await countActiveAdmins(client);
      if (admins <= 1) {
        return err(
          "LAST_ADMIN",
          "最後の管理者は無効化できません"
        );
      }
    }

    const { error } = await client
      .from("staff_profiles")
      .update({ is_active: input.isActive })
      .eq("id", input.targetUserId);
    if (error) {
      return err("UPDATE_FAILED", "状態の更新に失敗しました");
    }
    return {
      ok: true,
      staff_id: input.targetUserId,
      is_active: input.isActive,
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return err("CONFIG_ERROR", "サーバー設定が完了していません");
    }
    return err("UPDATE_FAILED", "状態の更新に失敗しました");
  }
}

export async function resendStaffInvite(input: {
  targetUserId: string;
  redirectTo?: string | null;
  client?: SupabaseClient<Database>;
}): Promise<{ ok: true; staff_id: string } | StaffAdminError> {
  try {
    const client = input.client ?? getServiceRoleSupabase();
    const profile = await loadStaffProfile(input.targetUserId);
    if (!profile) {
      return err("NOT_FOUND", "ユーザーが見つかりません");
    }
    if (!profile.is_active) {
      return err("INACTIVE", "無効なユーザーには再招待できません。先に有効化してください");
    }

    const { data: userData, error: userError } =
      await client.auth.admin.getUserById(input.targetUserId);
    if (userError || !userData.user?.email) {
      return err("NOT_FOUND", "Auth ユーザーが見つかりません");
    }
    const email = userData.user.email;

    if (userData.user.email_confirmed_at) {
      return err(
        "ALREADY_REGISTERED",
        "既に登録済みのユーザーです。パスワード再設定は Dashboard から行ってください"
      );
    }

    const { error: inviteError } = await client.auth.admin.inviteUserByEmail(
      email,
      {
        data: { display_name: profile.display_name },
        redirectTo: input.redirectTo || undefined,
      }
    );

    if (inviteError) {
      return err("RESEND_FAILED", "招待メールの再送に失敗しました");
    }

    return { ok: true, staff_id: input.targetUserId };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return err("CONFIG_ERROR", "サーバー設定が完了していません");
    }
    return err("RESEND_FAILED", "再送に失敗しました");
  }
}
