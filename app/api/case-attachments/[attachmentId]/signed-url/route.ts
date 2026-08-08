import { NextResponse, type NextRequest } from "next/server";

import { createSignedDownloadUrl } from "@/lib/caseAttachments/caseAttachmentsCore";
import {
  requireStaffJsonMutation,
  statusForAttachmentError,
} from "@/lib/caseAttachments/httpAuth";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ attachmentId: string }> };

/**
 * POST /api/case-attachments/[attachmentId]/signed-url
 * 短寿命 signed download URL（public URL 禁止）。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const started = Date.now();
  const auth = await requireStaffJsonMutation(
    request,
    "case-attachments/signed-url"
  );
  if (!auth.ok) return auth.response;

  const { attachmentId } = await context.params;
  const body = (auth.body && typeof auth.body === "object"
    ? auth.body
    : {}) as Record<string, unknown>;
  const expectedCaseId =
    typeof body.case_id === "string" ? body.case_id : "";

  const result = await createSignedDownloadUrl({
    attachmentId,
    expectedCaseId,
  });

  if (!result.ok) {
    gatewayLog({
      route: "case-attachments/signed-url",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForAttachmentError(result.error_code),
    });
  }

  gatewayLog({
    route: "case-attachments/signed-url",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
