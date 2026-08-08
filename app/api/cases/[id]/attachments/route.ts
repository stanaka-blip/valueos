import { NextResponse, type NextRequest } from "next/server";

import { listCaseAttachments } from "@/lib/caseAttachments/caseAttachmentsCore";
import {
  requireStaffSessionGet,
  statusForAttachmentError,
} from "@/lib/caseAttachments/httpAuth";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/cases/[id]/attachments
 * 案件の有効添付一覧（metadata のみ）。
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const started = Date.now();
  const auth = await requireStaffSessionGet(
    request,
    "cases/[id]/attachments"
  );
  if (!auth.ok) return auth.response;

  const { id: caseId } = await context.params;
  const result = await listCaseAttachments({ caseId });

  if (!result.ok) {
    gatewayLog({
      route: "cases/[id]/attachments",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForAttachmentError(result.error_code),
    });
  }

  gatewayLog({
    route: "cases/[id]/attachments",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
