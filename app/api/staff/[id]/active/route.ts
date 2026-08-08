import { NextResponse, type NextRequest } from "next/server";

import {
  requireStaffAdminMutation,
  statusForStaffError,
} from "@/lib/staff/httpAuth";
import { setStaffActive } from "@/lib/staff/staffAdminCore";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/staff/[id]/active
 * body: { is_active: boolean }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const started = Date.now();
  const auth = await requireStaffAdminMutation(request, "staff/active");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = (auth.body && typeof auth.body === "object"
    ? auth.body
    : {}) as Record<string, unknown>;

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message: "is_active が必要です",
      },
      { status: 400 }
    );
  }

  const actorUserId = auth.session.userId;
  if (!actorUserId) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "FORBIDDEN",
        error_message: "管理者のみ利用できます",
      },
      { status: 403 }
    );
  }

  const result = await setStaffActive({
    targetUserId: id,
    isActive: body.is_active,
    actorUserId,
  });

  if (!result.ok) {
    gatewayLog({
      route: "staff/active",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForStaffError(result.error_code),
    });
  }

  gatewayLog({
    route: "staff/active",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
