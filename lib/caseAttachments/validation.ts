import {
  ALLOWED_EXTENSIONS,
  ATTACHMENT_TYPE_IDS,
  EXTENSION_MIME_MAP,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_CASE,
  MAX_TOTAL_ATTACHMENT_BYTES_PER_CASE,
  type AttachmentTypeId,
} from "./constants";

export type AttachmentValidationError = {
  error_code: string;
  error_message: string;
};

export function isAttachmentTypeId(value: unknown): value is AttachmentTypeId {
  return typeof value === "string" && ATTACHMENT_TYPE_IDS.has(value);
}

export function extractExtension(filename: string): string | null {
  const base = filename.trim().split(/[/\\]/).pop() || "";
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return null;
  return base.slice(idx + 1).toLowerCase();
}

/**
 * Storage object 名（最終セグメント）を server 生成する。
 * ユーザーの元ファイル名は使わず、検証済み拡張子だけを引き継ぐ。
 * 例: file.xlsx / file.pdf
 */
export function buildStorageObjectName(originalFilename: string): string {
  const ext = extractExtension(originalFilename);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return "file.bin";
  }
  // ASCII のみ。空白・日本語・括弧・記号・path 断片を持ち込まない。
  return `file.${ext}`;
}

/**
 * @deprecated Storage key には使わない。互換のため残し、object 名生成へ委譲。
 */
export function sanitizeFilename(filename: string): string {
  return buildStorageObjectName(filename);
}

/**
 * Storage key: cases/{case_id}/{attachment_id}/file.{ext}
 * 元の表示用ファイル名は DB original_filename に別途保持する。
 */
export function buildStoragePath(input: {
  caseId: string;
  attachmentId: string;
  originalFilename: string;
}): string {
  const objectName = buildStorageObjectName(input.originalFilename);
  return `cases/${input.caseId}/${input.attachmentId}/${objectName}`;
}

export function validateFileMeta(input: {
  originalFilename: unknown;
  contentType: unknown;
  byteSize: unknown;
  attachmentType: unknown;
}): AttachmentValidationError | null {
  if (!isAttachmentTypeId(input.attachmentType)) {
    return {
      error_code: "INVALID_ATTACHMENT_TYPE",
      error_message: "添付種別が不正です",
    };
  }
  if (typeof input.originalFilename !== "string" || !input.originalFilename.trim()) {
    return {
      error_code: "INVALID_FILENAME",
      error_message: "ファイル名が不正です",
    };
  }
  if (input.originalFilename.length > 255) {
    return {
      error_code: "INVALID_FILENAME",
      error_message: "ファイル名が長すぎます",
    };
  }
  if (typeof input.contentType !== "string" || !input.contentType.trim()) {
    return {
      error_code: "INVALID_CONTENT_TYPE",
      error_message: "MIME タイプが不正です",
    };
  }
  if (
    typeof input.byteSize !== "number" ||
    !Number.isFinite(input.byteSize) ||
    !Number.isInteger(input.byteSize) ||
    input.byteSize <= 0
  ) {
    return {
      error_code: "INVALID_BYTE_SIZE",
      error_message: "ファイルサイズが不正です",
    };
  }
  if (input.byteSize > MAX_ATTACHMENT_BYTES) {
    return {
      error_code: "FILE_TOO_LARGE",
      error_message: "1ファイルあたり20MBまでです",
    };
  }

  const ext = extractExtension(input.originalFilename);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      error_code: "INVALID_EXTENSION",
      error_message: "許可されていない拡張子です",
    };
  }
  const allowedMimes = EXTENSION_MIME_MAP[ext] || [];
  const mime = input.contentType.trim().toLowerCase();
  if (!allowedMimes.includes(mime)) {
    return {
      error_code: "INVALID_CONTENT_TYPE",
      error_message: "拡張子と MIME タイプが一致しません",
    };
  }
  return null;
}

export function validateCaseQuota(input: {
  activeCount: number;
  pendingCount: number;
  activeBytes: number;
  pendingBytes: number;
  nextByteSize: number;
}): AttachmentValidationError | null {
  const totalCount = input.activeCount + input.pendingCount + 1;
  if (totalCount > MAX_ATTACHMENTS_PER_CASE) {
    return {
      error_code: "CASE_ATTACHMENT_COUNT_LIMIT",
      error_message: `1案件あたり${MAX_ATTACHMENTS_PER_CASE}件までです`,
    };
  }
  const totalBytes =
    input.activeBytes + input.pendingBytes + input.nextByteSize;
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES_PER_CASE) {
    return {
      error_code: "CASE_ATTACHMENT_SIZE_LIMIT",
      error_message: "1案件あたり合計100MBまでです",
    };
  }
  return null;
}
