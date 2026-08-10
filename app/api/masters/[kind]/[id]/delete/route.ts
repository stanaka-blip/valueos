import { NextResponse, type NextRequest } from "next/server";

import {
  requireStaffAdminMutation,
  statusForStaffError,
} from "@/lib/staff/httpAuth";
import { deleteMasterByKind } from "@/lib/masters/masterDeleteCore";
import type { MasterKind } from "@/lib/masters/masterKinds";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

const KINDS = new Set<MasterKind>(["dealer", "contractor", "manufacturer"]);

/**
 * マスタ物理削除（管理者のみ）。
 * Origin / CSRF / staff session / admin 必須。service_role はサーバーのみ。
 * 参照中は IN_USE で拒否。
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> }
) {
  const started = Date.now();
  const { kind: kindRaw, id } = await context.params;
  const kind = kindRaw as MasterKind;

  if (!KINDS.has(kind) || !id) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      },
      { status: 400 }
    );
  }

  const auth = await requireStaffAdminMutation(
    request,
    `masters/${kind}/delete`
  );
  if (!auth.ok) return auth.response;

  const result = await deleteMasterByKind(kind, id);
  if (!result.ok) {
    gatewayLog({
      route: `masters/${kind}/delete`,
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: result.error_code,
        error_message: result.error_message,
      },
      { status: statusForStaffError(result.error_code) }
    );
  }

  gatewayLog({
    route: `masters/${kind}/delete`,
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json({ ok: true });
}
