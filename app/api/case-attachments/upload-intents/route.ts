import { NextResponse, type NextRequest } from "next/server";

import { createUploadIntent } from "@/lib/caseAttachments/caseAttachmentsCore";
import {
  requireStaffJsonMutation,
  statusForAttachmentError,
} from "@/lib/caseAttachments/httpAuth";
import { toSafeAttachmentError } from "@/lib/caseAttachments/safeDto";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * POST /api/case-attachments/upload-intents
 * - session / Origin / CSRF
 * - validation + server-side storage_path 生成
 * - signed upload URL 発行（ファイル本体は通さない）
 */
export async function POST(request: NextRequest) {
  const started = Date.now();
  const auth = await requireStaffJsonMutation(
    request,
    "case-attachments/upload-intents"
  );
  if (!auth.ok) return auth.response;

  const body = (auth.body && typeof auth.body === "object"
    ? auth.body
    : {}) as Record<string, unknown>;

  // クライアント指定の storage_path は無視（サーバ生成のみ）
  if ("storage_path" in body || "storagePath" in body) {
    // 受け付けても使わないが、明示指定は拒否して誤用を防ぐ
    gatewayLog({
      route: "case-attachments/upload-intents",
      error_code: "STORAGE_PATH_FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeAttachmentError({
        error_code: "STORAGE_PATH_FORBIDDEN",
        error_message: "storage_path は指定できません",
      }),
      { status: 400 }
    );
  }

  const result = await createUploadIntent({
    caseId: typeof body.case_id === "string" ? body.case_id : "",
    attachmentType: body.attachment_type,
    originalFilename: body.original_filename,
    contentType: body.content_type,
    byteSize: body.byte_size,
    uploadedBySid: auth.session.sid,
    uploadedByUserId: auth.session.userId,
  });

  if (!result.ok) {
    gatewayLog({
      route: "case-attachments/upload-intents",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForAttachmentError(result.error_code),
    });
  }

  gatewayLog({
    route: "case-attachments/upload-intents",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
