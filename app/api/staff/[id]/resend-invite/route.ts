import { NextResponse, type NextRequest } from "next/server";

import {
  requireStaffAdminMutation,
  statusForStaffError,
} from "@/lib/staff/httpAuth";
import { resendStaffInvite } from "@/lib/staff/staffAdminCore";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/staff/[id]/resend-invite — 未確認ユーザーへの招待再送 */
export async function POST(request: NextRequest, context: RouteContext) {
  const started = Date.now();
  const auth = await requireStaffAdminMutation(request, "staff/resend-invite");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const origin = process.env.INTERNAL_APP_ORIGIN || undefined;

  const result = await resendStaffInvite({
    targetUserId: id,
    redirectTo: origin ? `${origin}/login` : null,
  });

  if (!result.ok) {
    gatewayLog({
      route: "staff/resend-invite",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForStaffError(result.error_code),
    });
  }

  gatewayLog({
    route: "staff/resend-invite",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
