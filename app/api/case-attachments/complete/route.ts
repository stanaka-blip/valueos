import { NextResponse, type NextRequest } from "next/server";

import { completeUploadIntent } from "@/lib/caseAttachments/caseAttachmentsCore";
import {
  requireStaffJsonMutation,
  statusForAttachmentError,
} from "@/lib/caseAttachments/httpAuth";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * POST /api/case-attachments/complete
 * Storage object 確認後に case_attachments metadata を INSERT。
 */
export async function POST(request: NextRequest) {
  const started = Date.now();
  const auth = await requireStaffJsonMutation(
    request,
    "case-attachments/complete"
  );
  if (!auth.ok) return auth.response;

  const body = (auth.body && typeof auth.body === "object"
    ? auth.body
    : {}) as Record<string, unknown>;

  const intentId =
    typeof body.intent_id === "string" ? body.intent_id : "";

  const result = await completeUploadIntent({
    intentId,
    uploadedBySid: auth.session.sid,
  });

  if (!result.ok) {
    gatewayLog({
      route: "case-attachments/complete",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForAttachmentError(result.error_code),
    });
  }

  gatewayLog({
    route: "case-attachments/complete",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
