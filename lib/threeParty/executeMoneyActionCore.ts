/**
 * 3社間金銭アクション実行（service_role クライアント注入）。
 * - 確定済み仕切金額は直接 UPDATE しない（訂正は新行）
 * - 取消は status=取消（物理 DELETE しない）
 * - 信販入金と仕入先支払の順序は固定しない
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";
import {
  hashMoneyActionPayload,
  type MoneyActionErrorCode,
  type MoneyFieldErrors,
  type ValidatedMoneyAction,
} from "@/lib/threeParty/moneyActionsLogic";

type AdminClient = SupabaseClient<Database>;

export type ExecuteMoneyActionResult =
  | {
      ok: true;
      request_id: string;
      action: string;
      case_id: string | null;
      resource_id: string;
      status: string;
      idempotent_replay: boolean;
    }
  | {
      ok: false;
      error_code: MoneyActionErrorCode;
      error_message: string;
      field_errors?: MoneyFieldErrors;
      request_id?: string;
    };

type LedgerRow = {
  request_id: string;
  action: string;
  case_id: string | null;
  resource_id: string | null;
  status: string;
  payload_hash: string;
  error_code: string | null;
  error_message: string | null;
  response: Json | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

async function markFailed(
  client: AdminClient,
  requestId: string,
  error_code: string,
  error_message: string
) {
  await client
    .from("three_party_money_requests")
    .update({
      status: "FAILED",
      error_code,
      error_message,
      completed_at: nowIso(),
    })
    .eq("request_id", requestId)
    .eq("status", "PROCESSING");
}

async function markCompleted(
  client: AdminClient,
  requestId: string,
  resourceId: string,
  caseId: string | null,
  response: Record<string, unknown>
) {
  await client
    .from("three_party_money_requests")
    .update({
      status: "COMPLETED",
      resource_id: resourceId,
      case_id: caseId,
      response: response as Json,
      completed_at: nowIso(),
      error_code: null,
      error_message: null,
    })
    .eq("request_id", requestId);
}

function success(
  requestId: string,
  action: string,
  caseId: string | null,
  resourceId: string,
  status: string,
  idempotent_replay: boolean
): ExecuteMoneyActionResult {
  return {
    ok: true,
    request_id: requestId,
    action,
    case_id: caseId,
    resource_id: resourceId,
    status,
    idempotent_replay,
  };
}

type BeginLedgerResult =
  | { kind: "fresh" }
  | { kind: "done"; result: ExecuteMoneyActionResult };

async function beginLedger(
  client: AdminClient,
  requestId: string,
  action: ValidatedMoneyAction,
  payloadHash: string
): Promise<BeginLedgerResult> {
  const caseId = action.case_id || null;

  const { error: insertError } = await client
    .from("three_party_money_requests")
    .insert({
      request_id: requestId,
      action: action.action,
      case_id: caseId,
      status: "PROCESSING",
      payload_hash: payloadHash,
    });

  if (!insertError) {
    return { kind: "fresh" };
  }

  const { data: existing, error: loadError } = await client
    .from("three_party_money_requests")
    .select(
      "request_id, action, case_id, resource_id, status, payload_hash, error_code, error_message, response"
    )
    .eq("request_id", requestId)
    .maybeSingle();

  if (loadError || !existing) {
    return {
      kind: "done",
      result: {
        ok: false,
        error_code: "ACTION_FAILED",
        error_message: "リクエストを開始できませんでした",
        request_id: requestId,
      },
    };
  }

  const row = existing as LedgerRow;
  if (row.payload_hash !== payloadHash || row.action !== action.action) {
    return {
      kind: "done",
      result: {
        ok: false,
        error_code: "REQUEST_ID_CONFLICT",
        error_message: "同じ Idempotency-Key で異なる内容は実行できません",
        request_id: requestId,
      },
    };
  }

  if (row.status === "PROCESSING") {
    return {
      kind: "done",
      result: {
        ok: false,
        error_code: "REQUEST_IN_PROGRESS",
        error_message: "同じリクエストが処理中です",
        request_id: requestId,
      },
    };
  }

  if (row.status === "COMPLETED" && row.resource_id) {
    const resp = (row.response || {}) as Record<string, unknown>;
    return {
      kind: "done",
      result: success(
        requestId,
        action.action,
        row.case_id,
        row.resource_id,
        typeof resp.status === "string" ? resp.status : "COMPLETED",
        true
      ),
    };
  }

  return {
    kind: "done",
    result: {
      ok: false,
      error_code: (row.error_code as MoneyActionErrorCode) || "ACTION_FAILED",
      error_message: row.error_message || "前回のリクエストは失敗しています",
      request_id: requestId,
    },
  };
}

export async function executeMoneyActionWithClient(
  requestId: string,
  action: ValidatedMoneyAction,
  client: AdminClient
): Promise<ExecuteMoneyActionResult> {
  const payloadHash = hashMoneyActionPayload(action);
  const ledger = await beginLedger(client, requestId, action, payloadHash);
  if (ledger.kind === "done") {
    return ledger.result;
  }

  try {
    const result = await dispatchAction(client, action);
    if (!result.ok) {
      await markFailed(
        client,
        requestId,
        result.error_code,
        result.error_message
      );
      return { ...result, request_id: requestId };
    }
    await markCompleted(client, requestId, result.resource_id, result.case_id, {
      status: result.status,
      resource_id: result.resource_id,
      case_id: result.case_id,
      action: action.action,
    });
    return success(
      requestId,
      action.action,
      result.case_id,
      result.resource_id,
      result.status,
      false
    );
  } catch (e) {
    console.warn("[executeMoneyAction] unexpected:", e);
    await markFailed(
      client,
      requestId,
      "ACTION_FAILED",
      "処理に失敗しました"
    );
    return {
      ok: false,
      error_code: "ACTION_FAILED",
      error_message: "処理に失敗しました",
      request_id: requestId,
    };
  }
}

type DispatchOk = {
  ok: true;
  resource_id: string;
  case_id: string | null;
  status: string;
};
type DispatchErr = {
  ok: false;
  error_code: MoneyActionErrorCode;
  error_message: string;
  field_errors?: MoneyFieldErrors;
};

async function dispatchAction(
  client: AdminClient,
  action: ValidatedMoneyAction
): Promise<DispatchOk | DispatchErr> {
  switch (action.action) {
    case "finance_receipt.create":
      return createFinanceReceipt(client, action.case_id, action.payload);
    case "finance_receipt.confirm":
      return confirmFinanceReceipt(client, action.resource_id, action.payload);
    case "finance_receipt.cancel":
      return cancelFinanceReceipt(client, action.resource_id, action.payload);
    case "finance_receipt.correct":
      return correctFinanceReceipt(client, action.resource_id, action.payload);
    case "dealer_settlement.create":
      return createDealerSettlement(client, action.case_id, action.payload);
    case "dealer_settlement.confirm":
      return confirmDealerSettlement(client, action.resource_id);
    case "dealer_settlement.pay":
      return payDealerSettlement(client, action.resource_id, action.payload);
    case "dealer_settlement.cancel":
      return cancelDealerSettlement(client, action.resource_id, action.payload);
    case "dealer_settlement.correct":
      return correctDealerSettlement(client, action.resource_id, action.payload);
    case "supplier_payment.create":
      return createSupplierPayment(client, action.case_id, action.payload);
    case "supplier_payment.pay":
      return paySupplierPayment(client, action.resource_id, action.payload);
    case "supplier_payment.cancel":
      return cancelSupplierPayment(client, action.resource_id, action.payload);
    case "supplier_payment.correct":
      return correctSupplierPayment(client, action.resource_id, action.payload);
    default:
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "アクションが不正です",
      };
  }
}

async function assertCaseExists(
  client: AdminClient,
  caseId: string
): Promise<DispatchErr | { ok: true; dealer_id: string | null }> {
  const { data, error } = await client
    .from("cases")
    .select("id, dealer_id")
    .eq("id", caseId)
    .maybeSingle();
  if (error || !data) {
    return {
      ok: false,
      error_code: "NOT_FOUND",
      error_message: "案件が見つかりません",
    };
  }
  return { ok: true, dealer_id: (data as { dealer_id: string | null }).dealer_id };
}

async function createFinanceReceipt(
  client: AdminClient,
  caseId: string,
  payload: Extract<ValidatedMoneyAction, { action: "finance_receipt.create" }>["payload"],
  correctsId: string | null = null
): Promise<DispatchOk | DispatchErr> {
  const caseOk = await assertCaseExists(client, caseId);
  if (!caseOk.ok) return caseOk;

  const { data, error } = await client
    .from("finance_receipts")
    .insert({
      case_id: caseId,
      finance_company: payload.finance_company,
      scheduled_date: payload.scheduled_date,
      scheduled_amount: payload.scheduled_amount,
      status: "予定",
      memo: payload.memo,
      corrects_id: correctsId,
    })
    .select("id, case_id, status")
    .single();

  if (error || !data) {
    console.warn("[finance_receipt.create]", error?.message);
    return {
      ok: false,
      error_code: "ACTION_FAILED",
      error_message: "信販入金を登録できませんでした",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function confirmFinanceReceipt(
  client: AdminClient,
  id: string,
  payload: Extract<ValidatedMoneyAction, { action: "finance_receipt.confirm" }>["payload"]
): Promise<DispatchOk | DispatchErr> {
  const { data: row, error } = await client
    .from("finance_receipts")
    .select("id, case_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "信販入金が見つかりません" };
  }
  if (row.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "取消済みの入金は確定できません" };
  }
  if (row.status === "入金済") {
    return { ok: false, error_code: "IMMUTABLE", error_message: "すでに入金済です。訂正してください" };
  }

  const { data, error: updErr } = await client
    .from("finance_receipts")
    .update({
      actual_date: payload.actual_date,
      actual_amount: payload.actual_amount,
      status: "入金済",
      memo: payload.memo ?? undefined,
    })
    .eq("id", id)
    .eq("status", "予定")
    .select("id, case_id, status")
    .maybeSingle();

  if (updErr || !data) {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "入金確定に失敗しました（状態が変化した可能性があります）",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function cancelFinanceReceipt(
  client: AdminClient,
  id: string,
  payload: { cancel_reason: string | null }
): Promise<DispatchOk | DispatchErr> {
  const { data: row, error } = await client
    .from("finance_receipts")
    .select("id, case_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "信販入金が見つかりません" };
  }
  if (row.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "すでに取消済みです" };
  }

  const { data, error: updErr } = await client
    .from("finance_receipts")
    .update({
      status: "取消",
      cancelled_at: nowIso(),
      cancel_reason: payload.cancel_reason,
    })
    .eq("id", id)
    .neq("status", "取消")
    .select("id, case_id, status")
    .maybeSingle();

  if (updErr || !data) {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "取消に失敗しました",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function correctFinanceReceipt(
  client: AdminClient,
  sourceId: string,
  payload: Extract<ValidatedMoneyAction, { action: "finance_receipt.correct" }>["payload"]
): Promise<DispatchOk | DispatchErr> {
  const { data: source, error } = await client
    .from("finance_receipts")
    .select("id, case_id, status")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !source) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "信販入金が見つかりません" };
  }
  if (source.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "取消済みは訂正できません" };
  }

  const created = await createFinanceReceipt(
    client,
    source.case_id,
    payload,
    sourceId
  );
  if (!created.ok) return created;

  const cancelled = await cancelFinanceReceipt(client, sourceId, {
    cancel_reason: payload.cancel_reason || "訂正のため取消",
  });
  if (!cancelled.ok) {
    await cancelFinanceReceipt(client, created.resource_id, {
      cancel_reason: "訂正の取消処理失敗のためロールバック",
    });
    return cancelled;
  }

  return created;
}

async function createDealerSettlement(
  client: AdminClient,
  caseId: string,
  payload: Extract<ValidatedMoneyAction, { action: "dealer_settlement.create" }>["payload"],
  correctsId: string | null = null
): Promise<DispatchOk | DispatchErr> {
  const caseOk = await assertCaseExists(client, caseId);
  if (!caseOk.ok) return caseOk;

  if (payload.finance_receipt_id) {
    const { data: fr } = await client
      .from("finance_receipts")
      .select("id, case_id, status")
      .eq("id", payload.finance_receipt_id)
      .maybeSingle();
    if (!fr || fr.case_id !== caseId) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "信販入金が案件と一致しません",
        field_errors: { finance_receipt_id: "案件と一致しません" },
      };
    }
    if (fr.status === "取消") {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "取消済みの信販入金は参照できません",
      };
    }
  }

  if (payload.invoice_id) {
    const { data: inv } = await client
      .from("invoices")
      .select("id, case_id")
      .eq("id", payload.invoice_id)
      .maybeSingle();
    if (!inv || inv.case_id !== caseId) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "請求が案件と一致しません",
        field_errors: { invoice_id: "案件と一致しません" },
      };
    }
  }

  const { data: header, error } = await client
    .from("dealer_settlements")
    .insert({
      case_id: caseId,
      dealer_id: payload.dealer_id,
      statement_no: payload.statement_no,
      issue_date: payload.issue_date,
      finance_receipt_id: payload.finance_receipt_id,
      invoice_id: payload.invoice_id,
      credit_received_amount: payload.credit_received_amount_calc,
      ve_share_amount: payload.ve_share_amount_calc,
      adjustment_total_amount: payload.adjustment_total_amount,
      payout_amount: payload.payout_amount,
      scheduled_payout_date: payload.scheduled_payout_date,
      contract_date: payload.contract_date,
      delivery_date: payload.delivery_date,
      status: "下書き",
      memo: payload.memo,
      corrects_id: correctsId,
    })
    .select("id, case_id, status")
    .single();

  if (error || !header) {
    console.warn("[dealer_settlement.create]", error?.message);
    return {
      ok: false,
      error_code: "ACTION_FAILED",
      error_message: "仕切清算を登録できませんでした",
    };
  }

  if (payload.lines.length > 0) {
    const lineRows = payload.lines.map((line) => ({
      dealer_settlement_id: header.id,
      sort_order: line.sort_order,
      line_kind: line.line_kind,
      description: line.description,
      amount: line.amount,
      memo: line.memo,
    }));
    const { error: lineErr } = await client
      .from("dealer_settlement_lines")
      .insert(lineRows);
    if (lineErr) {
      console.warn("[dealer_settlement.lines]", lineErr.message);
      await client
        .from("dealer_settlements")
        .update({
          status: "取消",
          cancelled_at: nowIso(),
          cancel_reason: "明細登録失敗のため取消",
        })
        .eq("id", header.id);
      return {
        ok: false,
        error_code: "ACTION_FAILED",
        error_message: "仕切明細を登録できませんでした",
      };
    }
  }

  return {
    ok: true,
    resource_id: header.id,
    case_id: header.case_id,
    status: header.status,
  };
}

async function confirmDealerSettlement(
  client: AdminClient,
  id: string
): Promise<DispatchOk | DispatchErr> {
  const { data: row, error } = await client
    .from("dealer_settlements")
    .select(
      "id, case_id, status, credit_received_amount, ve_share_amount, adjustment_total_amount, payout_amount"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "仕切清算が見つかりません" };
  }
  if (row.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "取消済みは確定できません" };
  }
  if (row.status === "確定" || row.status === "支払済") {
    return {
      ok: false,
      error_code: "IMMUTABLE",
      error_message: "確定済みの金額は変更できません。訂正してください",
    };
  }

  // 金額は作成時 snapshot を維持したまま status のみ確定（再計算UPDATE しない）
  const { data, error: updErr } = await client
    .from("dealer_settlements")
    .update({ status: "確定" })
    .eq("id", id)
    .eq("status", "下書き")
    .select("id, case_id, status")
    .maybeSingle();

  if (updErr || !data) {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "確定に失敗しました",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function payDealerSettlement(
  client: AdminClient,
  id: string,
  payload: Extract<ValidatedMoneyAction, { action: "dealer_settlement.pay" }>["payload"]
): Promise<DispatchOk | DispatchErr> {
  const { data: row, error } = await client
    .from("dealer_settlements")
    .select("id, case_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "仕切清算が見つかりません" };
  }
  if (row.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "取消済みには支払登録できません" };
  }
  if (row.status === "下書き") {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "先に確定してください",
    };
  }
  if (row.status === "支払済") {
    return {
      ok: false,
      error_code: "IMMUTABLE",
      error_message: "すでに支払済です。訂正してください",
    };
  }

  const { data, error: updErr } = await client
    .from("dealer_settlements")
    .update({
      actual_payout_date: payload.actual_payout_date,
      actual_payout_amount: payload.actual_payout_amount,
      status: "支払済",
      memo: payload.memo ?? undefined,
    })
    .eq("id", id)
    .eq("status", "確定")
    .select("id, case_id, status")
    .maybeSingle();

  if (updErr || !data) {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "支払登録に失敗しました",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function cancelDealerSettlement(
  client: AdminClient,
  id: string,
  payload: { cancel_reason: string | null }
): Promise<DispatchOk | DispatchErr> {
  const { data: row, error } = await client
    .from("dealer_settlements")
    .select("id, case_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "仕切清算が見つかりません" };
  }
  if (row.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "すでに取消済みです" };
  }

  const { data, error: updErr } = await client
    .from("dealer_settlements")
    .update({
      status: "取消",
      cancelled_at: nowIso(),
      cancel_reason: payload.cancel_reason,
    })
    .eq("id", id)
    .neq("status", "取消")
    .select("id, case_id, status")
    .maybeSingle();

  if (updErr || !data) {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "取消に失敗しました",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function correctDealerSettlement(
  client: AdminClient,
  sourceId: string,
  payload: Extract<ValidatedMoneyAction, { action: "dealer_settlement.correct" }>["payload"]
): Promise<DispatchOk | DispatchErr> {
  const { data: source, error } = await client
    .from("dealer_settlements")
    .select("id, case_id, status")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !source) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "仕切清算が見つかりません" };
  }
  if (source.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "取消済みは訂正できません" };
  }

  // 確定済み金額は直接UPDATEせず、新行（下書き）を作成してから元を取消
  const created = await createDealerSettlement(
    client,
    source.case_id,
    payload,
    sourceId
  );
  if (!created.ok) return created;

  const cancelled = await cancelDealerSettlement(client, sourceId, {
    cancel_reason: payload.cancel_reason || "訂正のため取消",
  });
  if (!cancelled.ok) {
    await cancelDealerSettlement(client, created.resource_id, {
      cancel_reason: "訂正の取消処理失敗のためロールバック",
    });
    return cancelled;
  }
  return created;
}

async function createSupplierPayment(
  client: AdminClient,
  caseId: string,
  payload: Extract<ValidatedMoneyAction, { action: "supplier_payment.create" }>["payload"],
  correctsId: string | null = null
): Promise<DispatchOk | DispatchErr> {
  const caseOk = await assertCaseExists(client, caseId);
  if (!caseOk.ok) return caseOk;

  // 信販入金完了は前提にしない（独立）
  if (payload.order_id) {
    const { data: order } = await client
      .from("orders")
      .select("id, case_id, supplier_id")
      .eq("id", payload.order_id)
      .maybeSingle();
    if (!order || order.case_id !== caseId) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "発注が案件と一致しません",
        field_errors: { order_id: "案件と一致しません" },
      };
    }
    if (order.supplier_id && order.supplier_id !== payload.supplier_id) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "発注の仕入先と一致しません",
        field_errors: { supplier_id: "発注の仕入先と一致しません" },
      };
    }
  }

  const { data, error } = await client
    .from("supplier_payments")
    .insert({
      case_id: caseId,
      supplier_id: payload.supplier_id,
      order_id: payload.order_id,
      due_date: payload.due_date,
      scheduled_amount: payload.scheduled_amount,
      status: "予定",
      memo: payload.memo,
      corrects_id: correctsId,
    })
    .select("id, case_id, status")
    .single();

  if (error || !data) {
    console.warn("[supplier_payment.create]", error?.message);
    return {
      ok: false,
      error_code: "ACTION_FAILED",
      error_message: "仕入先支払を登録できませんでした",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function paySupplierPayment(
  client: AdminClient,
  id: string,
  payload: Extract<ValidatedMoneyAction, { action: "supplier_payment.pay" }>["payload"]
): Promise<DispatchOk | DispatchErr> {
  const { data: row, error } = await client
    .from("supplier_payments")
    .select("id, case_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "仕入先支払が見つかりません" };
  }
  if (row.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "取消済みには支払登録できません" };
  }
  if (row.status === "支払済") {
    return {
      ok: false,
      error_code: "IMMUTABLE",
      error_message: "すでに支払済です。訂正してください",
    };
  }

  const { data, error: updErr } = await client
    .from("supplier_payments")
    .update({
      paid_date: payload.paid_date,
      paid_amount: payload.paid_amount,
      status: "支払済",
      memo: payload.memo ?? undefined,
    })
    .eq("id", id)
    .eq("status", "予定")
    .select("id, case_id, status")
    .maybeSingle();

  if (updErr || !data) {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "支払登録に失敗しました",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function cancelSupplierPayment(
  client: AdminClient,
  id: string,
  payload: { cancel_reason: string | null }
): Promise<DispatchOk | DispatchErr> {
  const { data: row, error } = await client
    .from("supplier_payments")
    .select("id, case_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "仕入先支払が見つかりません" };
  }
  if (row.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "すでに取消済みです" };
  }

  const { data, error: updErr } = await client
    .from("supplier_payments")
    .update({
      status: "取消",
      cancelled_at: nowIso(),
      cancel_reason: payload.cancel_reason,
    })
    .eq("id", id)
    .neq("status", "取消")
    .select("id, case_id, status")
    .maybeSingle();

  if (updErr || !data) {
    return {
      ok: false,
      error_code: "CONFLICT",
      error_message: "取消に失敗しました",
    };
  }
  return {
    ok: true,
    resource_id: data.id,
    case_id: data.case_id,
    status: data.status,
  };
}

async function correctSupplierPayment(
  client: AdminClient,
  sourceId: string,
  payload: Extract<ValidatedMoneyAction, { action: "supplier_payment.correct" }>["payload"]
): Promise<DispatchOk | DispatchErr> {
  const { data: source, error } = await client
    .from("supplier_payments")
    .select("id, case_id, status")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !source) {
    return { ok: false, error_code: "NOT_FOUND", error_message: "仕入先支払が見つかりません" };
  }
  if (source.status === "取消") {
    return { ok: false, error_code: "CONFLICT", error_message: "取消済みは訂正できません" };
  }

  const created = await createSupplierPayment(
    client,
    source.case_id,
    payload,
    sourceId
  );
  if (!created.ok) return created;

  const cancelled = await cancelSupplierPayment(client, sourceId, {
    cancel_reason: payload.cancel_reason || "訂正のため取消",
  });
  if (!cancelled.ok) {
    await cancelSupplierPayment(client, created.resource_id, {
      cancel_reason: "訂正の取消処理失敗のためロールバック",
    });
    return cancelled;
  }
  return created;
}
