import { NextResponse, type NextRequest } from "next/server";

import { deactivateAttachment } from "@/lib/caseAttachments/caseAttachmentsCore";
import {
  requireStaffJsonMutation,
  statusForAttachmentError,
} from "@/lib/caseAttachments/httpAuth";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ attachmentId: string }> };

/**
 * POST /api/case-attachments/[attachmentId]/deactivate
 * soft-delete（is_active=false）。Storage 物理削除はしない。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const started = Date.now();
  const auth = await requireStaffJsonMutation(
    request,
    "case-attachments/deactivate"
  );
  if (!auth.ok) return auth.response;

  const { attachmentId } = await context.params;
  const body = (auth.body && typeof auth.body === "object"
    ? auth.body
    : {}) as Record<string, unknown>;
  const expectedCaseId =
    typeof body.case_id === "string" ? body.case_id : "";

  const result = await deactivateAttachment({
    attachmentId,
    deletedBySid: auth.session.sid,
    expectedCaseId,
  });

  if (!result.ok) {
    gatewayLog({
      route: "case-attachments/deactivate",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForAttachmentError(result.error_code),
    });
  }

  gatewayLog({
    route: "case-attachments/deactivate",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
