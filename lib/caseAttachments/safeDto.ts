import type { AttachmentTypeId } from "./constants";

export type SafeAttachmentError = {
  ok: false;
  error_code: string;
  error_message: string;
};

export type SafeAttachmentListItem = {
  id: string;
  case_id: string;
  attachment_type: AttachmentTypeId | string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  uploaded_by_label: string;
  created_at: string;
  is_active: boolean;
};

export type SafeUploadIntentSuccess = {
  ok: true;
  intent_id: string;
  attachment_id: string;
  case_id: string;
  bucket: string;
  /** server 生成。クライアントはこれをそのまま uploadToSignedUrl に使う（任意指定不可） */
  storage_path: string;
  token: string;
  signed_url: string;
  expires_at: string;
  content_type: string;
  byte_size: number;
};

export type SafeCompleteSuccess = {
  ok: true;
  attachment: SafeAttachmentListItem;
};

export type SafeSignedUrlSuccess = {
  ok: true;
  signed_url: string;
  expires_in: number;
  original_filename: string;
  content_type: string;
};

export type SafeDeactivateSuccess = {
  ok: true;
  attachment_id: string;
};

export type SafeListSuccess = {
  ok: true;
  attachments: SafeAttachmentListItem[];
};

export function toSafeAttachmentError(input: {
  error_code: string;
  error_message: string;
}): SafeAttachmentError {
  return {
    ok: false,
    error_code: input.error_code,
    error_message: input.error_message,
  };
}
