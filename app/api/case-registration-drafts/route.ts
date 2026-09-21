import { NextResponse, type NextRequest } from "next/server";

import {
  isAuthSecretConfigured,
  isUuid,
} from "@/lib/gateway/authCookie";
import {
  assertCsrf,
  getSessionFromRequest,
  readJsonBodyLimited,
  requireJsonContentType,
} from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import {
  deleteCaseRegistrationDraftForUser,
  getCaseRegistrationDraftForUser,
  listCaseRegistrationDraftsForUser,
  upsertCaseRegistrationDraftForUser,
} from "@/lib/caseRegistrationDrafts/draftStore";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error_code: "UNAUTHORIZED",
      error_message: "認証が必要です",
    },
    { status: 401 }
  );
}

function requireUserId(session: { userId: string | null }) {
  if (!session.userId || !isUuid(session.userId)) {
    return null;
  }
  return session.userId;
}

export async function GET(request: NextRequest) {
  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) return unauthorized();
  const userId = requireUserId(session);
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "UNAUTHORIZED",
        error_message: "ユーザーを特定できません",
      },
      { status: 401 }
    );
  }

  if (!isAuthSecretConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      },
      { status: 503 }
    );
  }

  try {
    const client = getServiceRoleSupabase();
    const draftId = request.nextUrl.searchParams.get("id");
    if (draftId) {
      if (!isUuid(draftId)) {
        return NextResponse.json(
          {
            ok: false,
            error_code: "BAD_REQUEST",
            error_message: "下書きIDが不正です",
          },
          { status: 400 }
        );
      }
      const result = await getCaseRegistrationDraftForUser(
        client,
        draftId,
        userId
      );
      if (!result.ok) {
        return NextResponse.json(
          {
            ok: false,
            error_code: result.error_code,
            error_message: result.error_message,
          },
          { status: result.error_code === "FORBIDDEN" ? 403 : 404 }
        );
      }
      return NextResponse.json({ ok: true, draft: result.draft });
    }

    const listed = await listCaseRegistrationDraftsForUser(client, userId);
    if (!listed.ok) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "LOAD_FAILED",
          error_message: "下書き一覧を取得できませんでした",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      drafts: listed.drafts.map((d) => ({
        id: d.id,
        current_step: d.current_step,
        customer_name_preview: d.customer_name_preview,
        created_at: d.created_at,
        updated_at: d.updated_at,
      })),
    });
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "CONFIG_ERROR",
          error_message: "サーバー設定が完了していません",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error_code: "LOAD_FAILED",
        error_message: "下書き一覧を取得できませんでした",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!assertCsrf(request, session)) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      },
      { status: 403 }
    );
  }
  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      },
      { status: 415 }
    );
  }

  const userId = requireUserId(session);
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "UNAUTHORIZED",
        error_message: "ユーザーを特定できません",
      },
      { status: 401 }
    );
  }

  const bodyResult = await readJsonBodyLimited(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message: "入力内容が正しくありません",
      },
      { status: 400 }
    );
  }

  const body = bodyResult.value as { draft_id?: string; payload?: unknown };
  try {
    const client = getServiceRoleSupabase();
    const result = await upsertCaseRegistrationDraftForUser(client, userId, {
      draftId: body.draft_id || null,
      payload: body.payload,
    });
    if (!result.ok) {
      const status =
        result.error_code === "FORBIDDEN"
          ? 403
          : result.error_code === "NOT_FOUND"
            ? 404
            : 400;
      return NextResponse.json(
        {
          ok: false,
          error_code: result.error_code,
          error_message: result.error_message,
        },
        { status }
      );
    }
    return NextResponse.json({
      ok: true,
      draft: {
        id: result.draft.id,
        current_step: result.draft.current_step,
        customer_name_preview: result.draft.customer_name_preview,
        updated_at: result.draft.updated_at,
      },
    });
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "CONFIG_ERROR",
          error_message: "サーバー設定が完了していません",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error_code: "SAVE_FAILED",
        error_message: "下書きを保存できませんでした",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!assertCsrf(request, session)) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      },
      { status: 403 }
    );
  }

  const userId = requireUserId(session);
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "UNAUTHORIZED",
        error_message: "ユーザーを特定できません",
      },
      { status: 401 }
    );
  }

  const draftId = request.nextUrl.searchParams.get("id") || "";
  if (!isUuid(draftId)) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message: "下書きIDが不正です",
      },
      { status: 400 }
    );
  }

  try {
    const client = getServiceRoleSupabase();
    const result = await deleteCaseRegistrationDraftForUser(
      client,
      draftId,
      userId
    );
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error_code: result.error_code,
          error_message: result.error_message,
        },
        { status: result.error_code === "FORBIDDEN" ? 403 : 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "CONFIG_ERROR",
          error_message: "サーバー設定が完了していません",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error_code: "DELETE_FAILED",
        error_message: "下書きを削除できませんでした",
      },
      { status: 500 }
    );
  }
}
