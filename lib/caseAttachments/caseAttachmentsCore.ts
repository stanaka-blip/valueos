import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

import {
  CASE_ATTACHMENTS_BUCKET,
  SIGNED_DOWNLOAD_TTL_SECONDS,
  UPLOAD_INTENT_TTL_SECONDS,
  type AttachmentTypeId,
} from "./constants";
import {
  buildStoragePath,
  validateCaseQuota,
  validateFileMeta,
} from "./validation";
import type {
  SafeAttachmentListItem,
  SafeCompleteSuccess,
  SafeDeactivateSuccess,
  SafeListSuccess,
  SafeSignedUrlSuccess,
  SafeUploadIntentSuccess,
} from "./safeDto";
import { toSafeAttachmentError } from "./safeDto";

type Result<T> = T | ReturnType<typeof toSafeAttachmentError>;

type IntentRow = {
  id: string;
  attachment_id: string;
  case_id: string;
  attachment_type: string;
  original_filename: string;
  content_type: string;
  declared_byte_size: number;
  storage_bucket: string;
  storage_path: string;
  status: string;
  uploaded_by_sid: string | null;
  expires_at: string;
  completed_at: string | null;
};

type AttachmentRow = {
  id: string;
  case_id: string;
  attachment_type: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  storage_bucket: string;
  storage_path: string;
  uploaded_by_label: string;
  created_at: string;
  is_active: boolean;
  deleted_at: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function toListItem(row: AttachmentRow): SafeAttachmentListItem {
  return {
    id: row.id,
    case_id: row.case_id,
    attachment_type: row.attachment_type,
    original_filename: row.original_filename,
    content_type: row.content_type,
    byte_size: Number(row.byte_size),
    uploaded_by_label: row.uploaded_by_label,
    created_at: row.created_at,
    is_active: row.is_active,
  };
}

async function assertCaseExists(
  client: SupabaseClient<Database>,
  caseId: string
): Promise<boolean> {
  const { data, error } = await client
    .from("cases")
    .select("id")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function loadCaseQuota(
  client: SupabaseClient<Database>,
  caseId: string
): Promise<{
  activeCount: number;
  pendingCount: number;
  activeBytes: number;
  pendingBytes: number;
}> {
  const nowIso = new Date().toISOString();
  const [activeRes, pendingRes] = await Promise.all([
    client
      .from("case_attachments")
      .select("byte_size")
      .eq("case_id", caseId)
      .eq("is_active", true),
    client
      .from("case_attachment_upload_intents")
      .select("declared_byte_size")
      .eq("case_id", caseId)
      .eq("status", "pending")
      .gt("expires_at", nowIso),
  ]);
  if (activeRes.error) throw activeRes.error;
  if (pendingRes.error) throw pendingRes.error;

  const activeRows = activeRes.data || [];
  const pendingRows = pendingRes.data || [];
  return {
    activeCount: activeRows.length,
    pendingCount: pendingRows.length,
    activeBytes: activeRows.reduce(
      (sum, r) => sum + Number(r.byte_size || 0),
      0
    ),
    pendingBytes: pendingRows.reduce(
      (sum, r) => sum + Number(r.declared_byte_size || 0),
      0
    ),
  };
}

/**
 * 期限切れ pending intent を orphan として検出・best-effort 削除。
 * Storage object があれば remove を試み、intent を expired にする。
 */
export async function cleanupExpiredAttachmentIntents(
  client: SupabaseClient<Database> = getServiceRoleSupabase(),
  limit = 20
): Promise<{ cleaned: number }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("case_attachment_upload_intents")
    .select(
      "id, storage_bucket, storage_path, status, expires_at"
    )
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  const rows = data || [];
  let cleaned = 0;

  for (const row of rows) {
    try {
      await client.storage
        .from(row.storage_bucket || CASE_ATTACHMENTS_BUCKET)
        .remove([row.storage_path]);
    } catch {
      // best-effort
    }
    const { error: updErr } = await client
      .from("case_attachment_upload_intents")
      .update({ status: "expired" })
      .eq("id", row.id)
      .eq("status", "pending");
    if (!updErr) cleaned += 1;
  }
  return { cleaned };
}

export async function createUploadIntent(input: {
  caseId: string;
  attachmentType: unknown;
  originalFilename: unknown;
  contentType: unknown;
  byteSize: unknown;
  uploadedBySid: string | null;
  client?: SupabaseClient<Database>;
}): Promise<Result<SafeUploadIntentSuccess>> {
  try {
    const client = input.client ?? getServiceRoleSupabase();

    try {
      await cleanupExpiredAttachmentIntents(client, 10);
    } catch {
      // best-effort; ignore
    }

    if (typeof input.caseId !== "string" || !isUuid(input.caseId)) {
      return toSafeAttachmentError({
        error_code: "INVALID_CASE_ID",
        error_message: "案件が不正です",
      });
    }

    const metaErr = validateFileMeta({
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      byteSize: input.byteSize,
      attachmentType: input.attachmentType,
    });
    if (metaErr) return toSafeAttachmentError(metaErr);

    const exists = await assertCaseExists(client, input.caseId);
    if (!exists) {
      return toSafeAttachmentError({
        error_code: "CASE_NOT_FOUND",
        error_message: "案件が見つかりません",
      });
    }

    const quota = await loadCaseQuota(client, input.caseId);
    const quotaErr = validateCaseQuota({
      ...quota,
      nextByteSize: input.byteSize as number,
    });
    if (quotaErr) return toSafeAttachmentError(quotaErr);

    const attachmentId = randomUUID();
    const storagePath = buildStoragePath({
      caseId: input.caseId,
      attachmentId,
      originalFilename: input.originalFilename as string,
    });
    const expiresAt = new Date(
      Date.now() + UPLOAD_INTENT_TTL_SECONDS * 1000
    ).toISOString();

    const { data: intent, error: insertErr } = await client
      .from("case_attachment_upload_intents")
      .insert({
        attachment_id: attachmentId,
        case_id: input.caseId,
        attachment_type: input.attachmentType as AttachmentTypeId,
        original_filename: (input.originalFilename as string).trim(),
        content_type: (input.contentType as string).trim().toLowerCase(),
        declared_byte_size: input.byteSize as number,
        storage_bucket: CASE_ATTACHMENTS_BUCKET,
        storage_path: storagePath,
        status: "pending",
        uploaded_by_sid: input.uploadedBySid,
        expires_at: expiresAt,
      })
      .select(
        "id, attachment_id, case_id, storage_path, content_type, declared_byte_size, expires_at"
      )
      .single();

    if (insertErr || !intent) {
      return toSafeAttachmentError({
        error_code: "INTENT_CREATE_FAILED",
        error_message: "アップロード準備に失敗しました",
      });
    }

    const { data: signed, error: signErr } = await client.storage
      .from(CASE_ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signErr || !signed?.token || !signed.signedUrl) {
      await client
        .from("case_attachment_upload_intents")
        .update({ status: "abandoned" })
        .eq("id", intent.id);
      return toSafeAttachmentError({
        error_code: "SIGNED_UPLOAD_FAILED",
        error_message: "アップロードURLの発行に失敗しました",
      });
    }

    return {
      ok: true,
      intent_id: intent.id,
      attachment_id: intent.attachment_id,
      case_id: intent.case_id,
      bucket: CASE_ATTACHMENTS_BUCKET,
      storage_path: intent.storage_path,
      token: signed.token,
      signed_url: signed.signedUrl,
      expires_at: intent.expires_at,
      content_type: intent.content_type,
      byte_size: Number(intent.declared_byte_size),
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return toSafeAttachmentError({
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      });
    }
    return toSafeAttachmentError({
      error_code: "INTENT_CREATE_FAILED",
      error_message: "アップロード準備に失敗しました",
    });
  }
}

export async function completeUploadIntent(input: {
  intentId: string;
  uploadedBySid: string | null;
  client?: SupabaseClient<Database>;
}): Promise<Result<SafeCompleteSuccess>> {
  try {
    const client = input.client ?? getServiceRoleSupabase();

    if (typeof input.intentId !== "string" || !isUuid(input.intentId)) {
      return toSafeAttachmentError({
        error_code: "INVALID_INTENT_ID",
        error_message: "不正なリクエストです",
      });
    }

    const { data: intentRaw, error: intentErr } = await client
      .from("case_attachment_upload_intents")
      .select("*")
      .eq("id", input.intentId)
      .maybeSingle();

    if (intentErr) {
      return toSafeAttachmentError({
        error_code: "COMPLETE_FAILED",
        error_message: "アップロード完了処理に失敗しました",
      });
    }
    const intent = intentRaw as IntentRow | null;
    if (!intent) {
      return toSafeAttachmentError({
        error_code: "INTENT_NOT_FOUND",
        error_message: "アップロード予約が見つかりません",
      });
    }

    if (intent.status === "completed") {
      const { data: existing } = await client
        .from("case_attachments")
        .select(
          "id, case_id, attachment_type, original_filename, content_type, byte_size, uploaded_by_label, created_at, is_active, deleted_at, storage_bucket, storage_path"
        )
        .eq("id", intent.attachment_id)
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          attachment: toListItem(existing as AttachmentRow),
        };
      }
    }

    if (intent.status !== "pending") {
      return toSafeAttachmentError({
        error_code: "INTENT_NOT_PENDING",
        error_message: "このアップロード予約は無効です",
      });
    }

    if (new Date(intent.expires_at).getTime() < Date.now()) {
      await client
        .from("case_attachment_upload_intents")
        .update({ status: "expired" })
        .eq("id", intent.id)
        .eq("status", "pending");
      return toSafeAttachmentError({
        error_code: "INTENT_EXPIRED",
        error_message: "アップロード予約の有効期限が切れています",
      });
    }

    // Storage object の存在・サイズ確認（パスは intent 由来のみ）
    const objectPath = intent.storage_path;
    const folder = objectPath.includes("/")
      ? objectPath.slice(0, objectPath.lastIndexOf("/"))
      : "";
    const fileName = objectPath.includes("/")
      ? objectPath.slice(objectPath.lastIndexOf("/") + 1)
      : objectPath;

    const { data: listed, error: listErr } = await client.storage
      .from(intent.storage_bucket || CASE_ATTACHMENTS_BUCKET)
      .list(folder, { search: fileName, limit: 20 });

    if (listErr) {
      return toSafeAttachmentError({
        error_code: "STORAGE_VERIFY_FAILED",
        error_message: "アップロードファイルの確認に失敗しました",
      });
    }

    const obj = (listed || []).find((f) => f.name === fileName);
    if (!obj) {
      return toSafeAttachmentError({
        error_code: "OBJECT_NOT_FOUND",
        error_message: "アップロードファイルが見つかりません",
      });
    }

    const rawMeta = obj.metadata as { size?: number | string } | null;
    const metadataSize = Number(rawMeta?.size);
    const actualSize = Number.isFinite(metadataSize) ? metadataSize : NaN;
    if (!Number.isFinite(actualSize) || actualSize <= 0) {
      return toSafeAttachmentError({
        error_code: "STORAGE_VERIFY_FAILED",
        error_message: "アップロードファイルサイズを確認できません",
      });
    }
    if (actualSize > intent.declared_byte_size) {
      // 宣言超過は拒否（宣言より小さいのは許容: 実体確認優先）
      try {
        await client.storage
          .from(intent.storage_bucket)
          .remove([intent.storage_path]);
      } catch {
        // best-effort
      }
      await client
        .from("case_attachment_upload_intents")
        .update({ status: "abandoned" })
        .eq("id", intent.id);
      return toSafeAttachmentError({
        error_code: "BYTE_SIZE_MISMATCH",
        error_message: "ファイルサイズが申告と一致しません",
      });
    }
    if (actualSize > 20 * 1024 * 1024) {
      try {
        await client.storage
          .from(intent.storage_bucket)
          .remove([intent.storage_path]);
      } catch {
        // best-effort
      }
      await client
        .from("case_attachment_upload_intents")
        .update({ status: "abandoned" })
        .eq("id", intent.id);
      return toSafeAttachmentError({
        error_code: "FILE_TOO_LARGE",
        error_message: "1ファイルあたり20MBまでです",
      });
    }

    const { data: inserted, error: insertErr } = await client
      .from("case_attachments")
      .insert({
        id: intent.attachment_id,
        case_id: intent.case_id,
        attachment_type: intent.attachment_type,
        original_filename: intent.original_filename,
        content_type: intent.content_type,
        byte_size: actualSize,
        storage_bucket: intent.storage_bucket,
        storage_path: intent.storage_path,
        uploaded_by_sid: input.uploadedBySid ?? intent.uploaded_by_sid,
        uploaded_by_label: "社内ユーザー",
        is_active: true,
        deleted_at: null,
      })
      .select(
        "id, case_id, attachment_type, original_filename, content_type, byte_size, uploaded_by_label, created_at, is_active, deleted_at, storage_bucket, storage_path"
      )
      .single();

    if (insertErr || !inserted) {
      // unique 競合なら既存を返す
      const { data: existing } = await client
        .from("case_attachments")
        .select(
          "id, case_id, attachment_type, original_filename, content_type, byte_size, uploaded_by_label, created_at, is_active, deleted_at, storage_bucket, storage_path"
        )
        .eq("id", intent.attachment_id)
        .maybeSingle();
      if (existing) {
        await client
          .from("case_attachment_upload_intents")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", intent.id);
        return {
          ok: true,
          attachment: toListItem(existing as AttachmentRow),
        };
      }
      return toSafeAttachmentError({
        error_code: "COMPLETE_FAILED",
        error_message: "添付メタデータの保存に失敗しました",
      });
    }

    await client
      .from("case_attachment_upload_intents")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", intent.id)
      .eq("status", "pending");

    return {
      ok: true,
      attachment: toListItem(inserted as AttachmentRow),
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return toSafeAttachmentError({
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      });
    }
    return toSafeAttachmentError({
      error_code: "COMPLETE_FAILED",
      error_message: "アップロード完了処理に失敗しました",
    });
  }
}

export async function listCaseAttachments(input: {
  caseId: string;
  includeInactive?: boolean;
  client?: SupabaseClient<Database>;
}): Promise<Result<SafeListSuccess>> {
  try {
    const client = input.client ?? getServiceRoleSupabase();
    if (!isUuid(input.caseId)) {
      return toSafeAttachmentError({
        error_code: "INVALID_CASE_ID",
        error_message: "案件が不正です",
      });
    }
    const exists = await assertCaseExists(client, input.caseId);
    if (!exists) {
      return toSafeAttachmentError({
        error_code: "CASE_NOT_FOUND",
        error_message: "案件が見つかりません",
      });
    }

    let query = client
      .from("case_attachments")
      .select(
        "id, case_id, attachment_type, original_filename, content_type, byte_size, uploaded_by_label, created_at, is_active, deleted_at, storage_bucket, storage_path"
      )
      .eq("case_id", input.caseId)
      .order("created_at", { ascending: false });

    if (!input.includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return toSafeAttachmentError({
        error_code: "LIST_FAILED",
        error_message: "添付一覧の取得に失敗しました",
      });
    }

    return {
      ok: true,
      attachments: (data || []).map((row) => toListItem(row as AttachmentRow)),
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return toSafeAttachmentError({
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      });
    }
    return toSafeAttachmentError({
      error_code: "LIST_FAILED",
      error_message: "添付一覧の取得に失敗しました",
    });
  }
}

export async function createSignedDownloadUrl(input: {
  attachmentId: string;
  /** 呼び出し元が期待する case_id（他案件横断禁止） */
  expectedCaseId?: string | null;
  client?: SupabaseClient<Database>;
}): Promise<Result<SafeSignedUrlSuccess>> {
  try {
    const client = input.client ?? getServiceRoleSupabase();
    if (!isUuid(input.attachmentId)) {
      return toSafeAttachmentError({
        error_code: "INVALID_ATTACHMENT_ID",
        error_message: "添付が不正です",
      });
    }

    const { data, error } = await client
      .from("case_attachments")
      .select(
        "id, case_id, original_filename, content_type, storage_bucket, storage_path, is_active"
      )
      .eq("id", input.attachmentId)
      .maybeSingle();

    if (error || !data) {
      return toSafeAttachmentError({
        error_code: "ATTACHMENT_NOT_FOUND",
        error_message: "添付が見つかりません",
      });
    }
    if (!data.is_active) {
      return toSafeAttachmentError({
        error_code: "ATTACHMENT_INACTIVE",
        error_message: "削除済みの添付です",
      });
    }
    if (
      input.expectedCaseId &&
      isUuid(input.expectedCaseId) &&
      data.case_id !== input.expectedCaseId
    ) {
      return toSafeAttachmentError({
        error_code: "FORBIDDEN",
        error_message: "この案件の添付ではありません",
      });
    }

    const { data: signed, error: signErr } = await client.storage
      .from(data.storage_bucket || CASE_ATTACHMENTS_BUCKET)
      .createSignedUrl(data.storage_path, SIGNED_DOWNLOAD_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      return toSafeAttachmentError({
        error_code: "SIGNED_DOWNLOAD_FAILED",
        error_message: "ダウンロードURLの発行に失敗しました",
      });
    }

    return {
      ok: true,
      signed_url: signed.signedUrl,
      expires_in: SIGNED_DOWNLOAD_TTL_SECONDS,
      original_filename: data.original_filename,
      content_type: data.content_type,
    };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return toSafeAttachmentError({
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      });
    }
    return toSafeAttachmentError({
      error_code: "SIGNED_DOWNLOAD_FAILED",
      error_message: "ダウンロードURLの発行に失敗しました",
    });
  }
}

export async function deactivateAttachment(input: {
  attachmentId: string;
  deletedBySid: string | null;
  expectedCaseId?: string | null;
  client?: SupabaseClient<Database>;
}): Promise<Result<SafeDeactivateSuccess>> {
  try {
    const client = input.client ?? getServiceRoleSupabase();
    if (!isUuid(input.attachmentId)) {
      return toSafeAttachmentError({
        error_code: "INVALID_ATTACHMENT_ID",
        error_message: "添付が不正です",
      });
    }

    const { data, error } = await client
      .from("case_attachments")
      .select("id, case_id, is_active")
      .eq("id", input.attachmentId)
      .maybeSingle();

    if (error || !data) {
      return toSafeAttachmentError({
        error_code: "ATTACHMENT_NOT_FOUND",
        error_message: "添付が見つかりません",
      });
    }
    if (
      input.expectedCaseId &&
      isUuid(input.expectedCaseId) &&
      data.case_id !== input.expectedCaseId
    ) {
      return toSafeAttachmentError({
        error_code: "FORBIDDEN",
        error_message: "この案件の添付ではありません",
      });
    }
    if (!data.is_active) {
      return { ok: true, attachment_id: data.id };
    }

    const { error: updErr } = await client
      .from("case_attachments")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by_sid: input.deletedBySid,
      })
      .eq("id", data.id)
      .eq("is_active", true);

    if (updErr) {
      return toSafeAttachmentError({
        error_code: "DEACTIVATE_FAILED",
        error_message: "添付の削除に失敗しました",
      });
    }

    return { ok: true, attachment_id: data.id };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return toSafeAttachmentError({
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      });
    }
    return toSafeAttachmentError({
      error_code: "DEACTIVATE_FAILED",
      error_message: "添付の削除に失敗しました",
    });
  }
}
