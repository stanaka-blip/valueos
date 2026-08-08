import { createClient } from "@supabase/supabase-js";

import {
  ATTACHMENT_TYPES,
  CASE_ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_BYTES,
  type AttachmentTypeId,
} from "./constants";
import { validateFileMeta } from "./validation";

export type PendingAttachmentDraft = {
  localId: string;
  file: File;
  attachmentType: AttachmentTypeId;
  status: "queued" | "uploading" | "completing" | "success" | "error";
  progress: number;
  errorMessage?: string;
  intentId?: string;
  attachmentId?: string;
};

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentTypeLabel(id: string): string {
  return ATTACHMENT_TYPES.find((t) => t.id === id)?.label || id;
}

async function fetchCsrfToken(): Promise<
  { ok: true; token: string } | { ok: false; error_message: string }
> {
  const csrfRes = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const csrfData = (await csrfRes.json().catch(() => ({}))) as {
    csrfToken?: string;
    error_message?: string;
  };
  if (!csrfRes.ok || !csrfData.csrfToken) {
    return {
      ok: false,
      error_message: csrfData.error_message || "認証が必要です",
    };
  }
  return { ok: true, token: csrfData.csrfToken };
}

function createPublishableStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase クライアント設定がありません");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Direct-to-Storage: intent → Storage uploadToSignedUrl → complete。
 * ファイル本体は Vercel Route Handler を経由しない。
 */
export async function uploadCaseAttachment(options: {
  caseId: string;
  file: File;
  attachmentType: AttachmentTypeId;
  onProgress?: (progress: number) => void;
}): Promise<
  | { ok: true; attachmentId: string; intentId: string }
  | { ok: false; error_message: string }
> {
  const metaErr = validateFileMeta({
    originalFilename: options.file.name,
    contentType: options.file.type || "application/octet-stream",
    byteSize: options.file.size,
    attachmentType: options.attachmentType,
  });
  if (metaErr) {
    return { ok: false, error_message: metaErr.error_message };
  }
  if (options.file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error_message: "1ファイルあたり20MBまでです" };
  }

  const csrf = await fetchCsrfToken();
  if (!csrf.ok) return csrf;

  options.onProgress?.(5);

  const intentRes = await fetch("/api/case-attachments/upload-intents", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf.token,
    },
    body: JSON.stringify({
      case_id: options.caseId,
      attachment_type: options.attachmentType,
      original_filename: options.file.name,
      content_type: options.file.type || "application/octet-stream",
      byte_size: options.file.size,
    }),
  });

  const intentData = (await intentRes.json().catch(() => ({}))) as {
    ok?: boolean;
    intent_id?: string;
    attachment_id?: string;
    storage_path?: string;
    token?: string;
    bucket?: string;
    error_message?: string;
  };

  if (
    !intentRes.ok ||
    !intentData.ok ||
    !intentData.intent_id ||
    !intentData.storage_path ||
    !intentData.token
  ) {
    return {
      ok: false,
      error_message: intentData.error_message || "アップロード準備に失敗しました",
    };
  }

  options.onProgress?.(20);

  const supabase = createPublishableStorageClient();
  const { error: uploadError } = await supabase.storage
    .from(intentData.bucket || CASE_ATTACHMENTS_BUCKET)
    .uploadToSignedUrl(intentData.storage_path, intentData.token, options.file, {
      contentType: options.file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return {
      ok: false,
      error_message: uploadError.message || "ストレージへのアップロードに失敗しました",
    };
  }

  options.onProgress?.(80);

  const completeCsrf = await fetchCsrfToken();
  if (!completeCsrf.ok) return completeCsrf;

  const completeRes = await fetch("/api/case-attachments/complete", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": completeCsrf.token,
    },
    body: JSON.stringify({ intent_id: intentData.intent_id }),
  });

  const completeData = (await completeRes.json().catch(() => ({}))) as {
    ok?: boolean;
    attachment?: { id?: string };
    error_message?: string;
  };

  if (!completeRes.ok || !completeData.ok) {
    return {
      ok: false,
      error_message:
        completeData.error_message ||
        "アップロード後の確定に失敗しました。しばらくして再送してください",
    };
  }

  options.onProgress?.(100);
  return {
    ok: true,
    attachmentId: completeData.attachment?.id || intentData.attachment_id || "",
    intentId: intentData.intent_id,
  };
}

export async function uploadPendingDrafts(options: {
  caseId: string;
  drafts: PendingAttachmentDraft[];
  onUpdate: (drafts: PendingAttachmentDraft[]) => void;
}): Promise<PendingAttachmentDraft[]> {
  let current = [...options.drafts];
  const update = (next: PendingAttachmentDraft[]) => {
    current = next;
    options.onUpdate(next);
  };

  for (let i = 0; i < current.length; i += 1) {
    const draft = current[i];
    if (draft.status === "success") continue;
    // 件数・合計サイズ上限は server 側で最終判定

    update(
      current.map((d, idx) =>
        idx === i
          ? { ...d, status: "uploading", progress: 0, errorMessage: undefined }
          : d
      )
    );

    const result = await uploadCaseAttachment({
      caseId: options.caseId,
      file: draft.file,
      attachmentType: draft.attachmentType,
      onProgress: (progress) => {
        update(
          current.map((d, idx) =>
            idx === i
              ? {
                  ...d,
                  status: progress >= 80 ? "completing" : "uploading",
                  progress,
                }
              : d
          )
        );
      },
    });

    if (result.ok) {
      update(
        current.map((d, idx) =>
          idx === i
            ? {
                ...d,
                status: "success",
                progress: 100,
                intentId: result.intentId,
                attachmentId: result.attachmentId,
                errorMessage: undefined,
              }
            : d
        )
      );
    } else {
      update(
        current.map((d, idx) =>
          idx === i
            ? {
                ...d,
                status: "error",
                progress: 0,
                errorMessage: result.error_message,
              }
            : d
        )
      );
    }
  }

  return current;
}

export function createDraftLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
