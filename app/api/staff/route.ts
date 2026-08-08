import { NextResponse, type NextRequest } from "next/server";

import {
  requireStaffAdminGet,
  requireStaffAdminMutation,
  statusForStaffError,
} from "@/lib/staff/httpAuth";
import { inviteStaffUser, listStaffUsers } from "@/lib/staff/staffAdminCore";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/** GET /api/staff — 管理者のみ。社内ユーザー一覧 */
export async function GET(request: NextRequest) {
  const started = Date.now();
  const auth = await requireStaffAdminGet(request, "staff/list");
  if (!auth.ok) return auth.response;

  const result = await listStaffUsers();
  if (!result.ok) {
    gatewayLog({
      route: "staff/list",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForStaffError(result.error_code),
    });
  }

  gatewayLog({
    route: "staff/list",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}

/** POST /api/staff — 管理者のみ。招待 + profiles 作成 */
export async function POST(request: NextRequest) {
  const started = Date.now();
  const auth = await requireStaffAdminMutation(request, "staff/invite");
  if (!auth.ok) return auth.response;

  const body = (auth.body && typeof auth.body === "object"
    ? auth.body
    : {}) as Record<string, unknown>;

  const origin = process.env.INTERNAL_APP_ORIGIN || undefined;
  const result = await inviteStaffUser({
    email: typeof body.email === "string" ? body.email : "",
    displayName: typeof body.display_name === "string" ? body.display_name : "",
    isAdmin: body.is_admin === true,
    redirectTo: origin ? `${origin}/login` : null,
  });

  if (!result.ok) {
    gatewayLog({
      route: "staff/invite",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(result, {
      status: statusForStaffError(result.error_code),
    });
  }

  gatewayLog({
    route: "staff/invite",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(result);
}
