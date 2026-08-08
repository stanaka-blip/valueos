/** 案件添付資料の定数（browser / server 共有可） */

export const CASE_ATTACHMENTS_BUCKET = "case-attachments";

/** 1ファイル上限 20MB */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** 1案件あたり有効添付の上限件数 */
export const MAX_ATTACHMENTS_PER_CASE = 20;

/** 1案件あたり有効添付の合計バイト上限 */
export const MAX_TOTAL_ATTACHMENT_BYTES_PER_CASE = 100 * 1024 * 1024;

/** signed download URL の寿命（秒） */
export const SIGNED_DOWNLOAD_TTL_SECONDS = 60;

/**
 * signed upload intent の寿命（秒）。
 * Supabase createSignedUploadUrl は約 2 時間有効のため、intent もそれに合わせる。
 */
export const UPLOAD_INTENT_TTL_SECONDS = 2 * 60 * 60;

export const ATTACHMENT_TYPES = [
  { id: "estimate", label: "見積" },
  { id: "contract", label: "契約" },
  { id: "drawing", label: "図面" },
  { id: "photo", label: "写真" },
  { id: "invoice_doc", label: "請求関連" },
  { id: "other", label: "その他" },
] as const;

export type AttachmentTypeId = (typeof ATTACHMENT_TYPES)[number]["id"];

export const ATTACHMENT_TYPE_IDS = new Set<string>(
  ATTACHMENT_TYPES.map((t) => t.id)
);

/** 拡張子 → 許可 MIME（両方一致が必要） */
export const EXTENSION_MIME_MAP: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  xls: ["application/vnd.ms-excel"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  doc: ["application/msword"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ppt: ["application/vnd.ms-powerpoint"],
  csv: ["text/csv", "application/csv", "text/plain"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
};

export const ALLOWED_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME_MAP));
