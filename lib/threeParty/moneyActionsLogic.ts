/**
 * 3社間金銭 API の入力検証・正規化（純関数）。
 * 確定済み金額の直接UPDATEは扱わない（訂正は別アクション）。
 */

import { createHash } from "node:crypto";

import {
  calculateDealerSettlementPayout,
  isDealerSettlementAdjustmentKind,
  type DealerSettlementLineKind,
} from "@/lib/threeParty/dealerSettlementCalc";

export type MoneyAction =
  | "finance_receipt.create"
  | "finance_receipt.confirm"
  | "finance_receipt.cancel"
  | "finance_receipt.correct"
  | "dealer_settlement.create"
  | "dealer_settlement.confirm"
  | "dealer_settlement.pay"
  | "dealer_settlement.cancel"
  | "dealer_settlement.correct"
  | "supplier_payment.create"
  | "supplier_payment.pay"
  | "supplier_payment.cancel"
  | "supplier_payment.correct";

export type MoneyFieldErrors = Record<string, string>;

export type MoneyActionErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IMMUTABLE"
  | "REQUEST_ID_CONFLICT"
  | "REQUEST_IN_PROGRESS"
  | "CONFIG_ERROR"
  | "ACTION_FAILED";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SHORT = 200;
const MAX_LONG = 2000;
const MAX_LINES = 50;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function trimStr(
  value: unknown,
  max: number,
  field: string,
  errors: MoneyFieldErrors,
  required: boolean
): string | null {
  if (value == null || String(value).trim() === "") {
    if (required) errors[field] = "必須です";
    return null;
  }
  const v = String(value).trim();
  if (v.length > max) {
    errors[field] = "文字数が上限を超えています";
    return null;
  }
  return v;
}

function parseDate(
  value: unknown,
  field: string,
  errors: MoneyFieldErrors,
  required: boolean
): string | null {
  if (value == null || String(value).trim() === "") {
    if (required) errors[field] = "必須です";
    return null;
  }
  const v = String(value).trim();
  if (!DATE_RE.test(v)) {
    errors[field] = "日付が不正です";
    return null;
  }
  return v;
}

function parseMoney(
  value: unknown,
  field: string,
  errors: MoneyFieldErrors,
  required: boolean
): number | null {
  if (value == null || value === "") {
    if (required) errors[field] = "必須です";
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    errors[field] = "金額が不正です";
    return null;
  }
  if (n < 0) {
    errors[field] = "金額は0以上で入力してください";
    return null;
  }
  return Math.floor(n);
}

export type FinanceReceiptCreatePayload = {
  finance_company: string;
  scheduled_date: string | null;
  scheduled_amount: number;
  memo: string | null;
};

export type FinanceReceiptConfirmPayload = {
  actual_date: string;
  actual_amount: number;
  memo: string | null;
};

export type CancelPayload = {
  cancel_reason: string | null;
};

export type FinanceReceiptCorrectPayload = FinanceReceiptCreatePayload & {
  cancel_reason: string | null;
};

export type DealerSettlementLineInput = {
  line_kind: DealerSettlementLineKind;
  description: string;
  amount: number;
  memo: string | null;
  sort_order: number;
};

export type DealerSettlementCreatePayload = {
  dealer_id: string;
  statement_no: string | null;
  issue_date: string | null;
  finance_receipt_id: string | null;
  invoice_id: string | null;
  scheduled_payout_date: string | null;
  contract_date: string | null;
  delivery_date: string | null;
  memo: string | null;
  credit_received_amount: number;
  ve_share_amount: number;
  lines: DealerSettlementLineInput[];
  credit_received_amount_calc: number;
  ve_share_amount_calc: number;
  adjustment_total_amount: number;
  payout_amount: number;
};

export type DealerSettlementPayPayload = {
  actual_payout_date: string;
  actual_payout_amount: number;
  memo: string | null;
};

export type DealerSettlementCorrectPayload = DealerSettlementCreatePayload & {
  cancel_reason: string | null;
};

export type SupplierPaymentCreatePayload = {
  supplier_id: string;
  order_id: string | null;
  due_date: string | null;
  scheduled_amount: number;
  memo: string | null;
};

export type SupplierPaymentPayPayload = {
  paid_date: string;
  paid_amount: number;
  memo: string | null;
};

export type SupplierPaymentCorrectPayload = SupplierPaymentCreatePayload & {
  cancel_reason: string | null;
};

export type ValidatedMoneyAction =
  | {
      action: "finance_receipt.create";
      case_id: string;
      resource_id: null;
      payload: FinanceReceiptCreatePayload;
    }
  | {
      action: "finance_receipt.confirm";
      case_id: string | null;
      resource_id: string;
      payload: FinanceReceiptConfirmPayload;
    }
  | {
      action: "finance_receipt.cancel";
      case_id: string | null;
      resource_id: string;
      payload: CancelPayload;
    }
  | {
      action: "finance_receipt.correct";
      case_id: string | null;
      resource_id: string;
      payload: FinanceReceiptCorrectPayload;
    }
  | {
      action: "dealer_settlement.create";
      case_id: string;
      resource_id: null;
      payload: DealerSettlementCreatePayload;
    }
  | {
      action: "dealer_settlement.confirm";
      case_id: string | null;
      resource_id: string;
      payload: Record<string, never>;
    }
  | {
      action: "dealer_settlement.pay";
      case_id: string | null;
      resource_id: string;
      payload: DealerSettlementPayPayload;
    }
  | {
      action: "dealer_settlement.cancel";
      case_id: string | null;
      resource_id: string;
      payload: CancelPayload;
    }
  | {
      action: "dealer_settlement.correct";
      case_id: string | null;
      resource_id: string;
      payload: DealerSettlementCorrectPayload;
    }
  | {
      action: "supplier_payment.create";
      case_id: string;
      resource_id: null;
      payload: SupplierPaymentCreatePayload;
    }
  | {
      action: "supplier_payment.pay";
      case_id: string | null;
      resource_id: string;
      payload: SupplierPaymentPayPayload;
    }
  | {
      action: "supplier_payment.cancel";
      case_id: string | null;
      resource_id: string;
      payload: CancelPayload;
    }
  | {
      action: "supplier_payment.correct";
      case_id: string | null;
      resource_id: string;
      payload: SupplierPaymentCorrectPayload;
    };

export type ValidateMoneyActionResult =
  | { ok: true; value: ValidatedMoneyAction }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: MoneyFieldErrors;
    };

function parseCancelReason(
  body: Record<string, unknown>,
  errors: MoneyFieldErrors
): string | null {
  return trimStr(body.cancel_reason, MAX_LONG, "cancel_reason", errors, false);
}

function parseFinanceCreateBody(
  body: Record<string, unknown>,
  errors: MoneyFieldErrors
): FinanceReceiptCreatePayload | null {
  const finance_company = trimStr(
    body.finance_company,
    MAX_SHORT,
    "finance_company",
    errors,
    true
  );
  const scheduled_date = parseDate(
    body.scheduled_date,
    "scheduled_date",
    errors,
    false
  );
  const scheduled_amount = parseMoney(
    body.scheduled_amount,
    "scheduled_amount",
    errors,
    true
  );
  const memo = trimStr(body.memo, MAX_LONG, "memo", errors, false);
  if (Object.keys(errors).length > 0) return null;
  return {
    finance_company: finance_company!,
    scheduled_date,
    scheduled_amount: scheduled_amount!,
    memo,
  };
}

function parseDealerLines(
  raw: unknown,
  errors: MoneyFieldErrors
): DealerSettlementLineInput[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.lines = "明細配列が不正です";
    return null;
  }
  if (raw.length > MAX_LINES) {
    errors.lines = `明細は${MAX_LINES}件以内です`;
    return null;
  }
  const lines: DealerSettlementLineInput[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors[`lines.${i}`] = "明細が不正です";
      continue;
    }
    const r = row as Record<string, unknown>;
    const kind = String(r.line_kind || "").trim();
    const allowed: DealerSettlementLineKind[] = [
      "credit_in",
      "ve_share",
      "transfer_fee",
      "discount",
      "offset",
      "other",
    ];
    if (!(allowed as string[]).includes(kind)) {
      errors[`lines.${i}.line_kind`] = "種別が不正です";
      continue;
    }
    const description = trimStr(
      r.description,
      MAX_SHORT,
      `lines.${i}.description`,
      errors,
      true
    );
    const amount = parseMoney(r.amount, `lines.${i}.amount`, errors, true);
    const memo = trimStr(r.memo, MAX_LONG, `lines.${i}.memo`, errors, false);
    const sort_order =
      r.sort_order == null || r.sort_order === ""
        ? i + 1
        : Number(r.sort_order);
    if (!Number.isFinite(sort_order) || sort_order < 1) {
      errors[`lines.${i}.sort_order`] = "表示順が不正です";
      continue;
    }
    if (description == null || amount == null) continue;
    lines.push({
      line_kind: kind as DealerSettlementLineKind,
      description,
      amount,
      memo,
      sort_order: Math.floor(sort_order),
    });
  }
  if (Object.keys(errors).some((k) => k.startsWith("lines"))) return null;
  return lines;
}

function parseDealerCreateBody(
  body: Record<string, unknown>,
  errors: MoneyFieldErrors
): DealerSettlementCreatePayload | null {
  if (!isUuid(body.dealer_id)) {
    errors.dealer_id = "販売店IDが不正です";
  }
  const statement_no = trimStr(
    body.statement_no,
    MAX_SHORT,
    "statement_no",
    errors,
    false
  );
  const issue_date = parseDate(body.issue_date, "issue_date", errors, false);
  const finance_receipt_id =
    body.finance_receipt_id == null || body.finance_receipt_id === ""
      ? null
      : isUuid(body.finance_receipt_id)
        ? body.finance_receipt_id
        : (errors.finance_receipt_id = "信販入金IDが不正です", null);
  const invoice_id =
    body.invoice_id == null || body.invoice_id === ""
      ? null
      : isUuid(body.invoice_id)
        ? body.invoice_id
        : (errors.invoice_id = "請求IDが不正です", null);
  const scheduled_payout_date = parseDate(
    body.scheduled_payout_date,
    "scheduled_payout_date",
    errors,
    false
  );
  const contract_date = parseDate(
    body.contract_date,
    "contract_date",
    errors,
    false
  );
  const delivery_date = parseDate(
    body.delivery_date,
    "delivery_date",
    errors,
    false
  );
  const memo = trimStr(body.memo, MAX_LONG, "memo", errors, false);
  const credit_received_amount = parseMoney(
    body.credit_received_amount,
    "credit_received_amount",
    errors,
    true
  );
  const ve_share_amount = parseMoney(
    body.ve_share_amount,
    "ve_share_amount",
    errors,
    true
  );
  const lines = parseDealerLines(body.lines, errors);
  if (
    !isUuid(body.dealer_id) ||
    credit_received_amount == null ||
    ve_share_amount == null ||
    lines == null ||
    Object.keys(errors).length > 0
  ) {
    return null;
  }

  const calc = calculateDealerSettlementPayout({
    creditReceivedAmount: credit_received_amount,
    veShareAmount: ve_share_amount,
    adjustmentLines: lines.filter((l) =>
      isDealerSettlementAdjustmentKind(l.line_kind)
    ),
  });

  // 振込額が負 = 異常値。作成/訂正を拒否（DB側でも同チェック）
  if (calc.payoutAmount < 0) {
    errors.payout_amount =
      "振込額が負になります。金額・調整を見直してください";
    return null;
  }

  return {
    dealer_id: body.dealer_id,
    statement_no,
    issue_date,
    finance_receipt_id,
    invoice_id,
    scheduled_payout_date,
    contract_date,
    delivery_date,
    memo,
    credit_received_amount,
    ve_share_amount,
    lines,
    credit_received_amount_calc: calc.creditReceivedAmount,
    ve_share_amount_calc: calc.veShareAmount,
    adjustment_total_amount: calc.adjustmentTotalAmount,
    payout_amount: calc.payoutAmount,
  };
}

function parseSupplierCreateBody(
  body: Record<string, unknown>,
  errors: MoneyFieldErrors
): SupplierPaymentCreatePayload | null {
  if (!isUuid(body.supplier_id)) {
    errors.supplier_id = "仕入先IDが不正です";
  }
  const order_id =
    body.order_id == null || body.order_id === ""
      ? null
      : isUuid(body.order_id)
        ? body.order_id
        : (errors.order_id = "発注IDが不正です", null);
  const due_date = parseDate(body.due_date, "due_date", errors, false);
  const scheduled_amount = parseMoney(
    body.scheduled_amount,
    "scheduled_amount",
    errors,
    true
  );
  const memo = trimStr(body.memo, MAX_LONG, "memo", errors, false);
  if (!isUuid(body.supplier_id) || scheduled_amount == null) return null;
  if (Object.keys(errors).length > 0) return null;
  return {
    supplier_id: body.supplier_id,
    order_id,
    due_date,
    scheduled_amount,
    memo,
  };
}

/**
 * case_id / resource_id は URL 注入済みを正とする。
 * body の case_id / request_id / resource_id は信用しない。
 */
export function validateMoneyActionInput(input: {
  action: MoneyAction;
  caseId: string | null;
  resourceId: string | null;
  body: unknown;
}): ValidateMoneyActionResult {
  const errors: MoneyFieldErrors = {};
  if (
    !input.body ||
    typeof input.body !== "object" ||
    Array.isArray(input.body)
  ) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
    };
  }
  const body = input.body as Record<string, unknown>;
  const action = input.action;

  const needsCase = action.endsWith(".create");
  const needsResource = !action.endsWith(".create");

  if (needsCase && !isUuid(input.caseId)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "案件IDが不正です",
      field_errors: { case_id: "案件IDが不正です" },
    };
  }
  if (needsResource && !isUuid(input.resourceId)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "対象IDが不正です",
      field_errors: { resource_id: "対象IDが不正です" },
    };
  }

  switch (action) {
    case "finance_receipt.create": {
      const payload = parseFinanceCreateBody(body, errors);
      if (!payload) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId!,
          resource_id: null,
          payload,
        },
      };
    }
    case "finance_receipt.confirm": {
      const actual_date = parseDate(body.actual_date, "actual_date", errors, true);
      const actual_amount = parseMoney(
        body.actual_amount,
        "actual_amount",
        errors,
        true
      );
      const memo = trimStr(body.memo, MAX_LONG, "memo", errors, false);
      if (!actual_date || actual_amount == null || Object.keys(errors).length) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: { actual_date, actual_amount, memo },
        },
      };
    }
    case "finance_receipt.cancel":
    case "dealer_settlement.cancel":
    case "supplier_payment.cancel": {
      const cancel_reason = parseCancelReason(body, errors);
      if (Object.keys(errors).length) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: { cancel_reason },
        } as ValidatedMoneyAction,
      };
    }
    case "finance_receipt.correct": {
      const base = parseFinanceCreateBody(body, errors);
      const cancel_reason = parseCancelReason(body, errors);
      if (!base || Object.keys(errors).length) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: { ...base, cancel_reason },
        },
      };
    }
    case "dealer_settlement.create": {
      const payload = parseDealerCreateBody(body, errors);
      if (!payload) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId!,
          resource_id: null,
          payload,
        },
      };
    }
    case "dealer_settlement.confirm": {
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: {},
        },
      };
    }
    case "dealer_settlement.pay": {
      const actual_payout_date = parseDate(
        body.actual_payout_date,
        "actual_payout_date",
        errors,
        true
      );
      const actual_payout_amount = parseMoney(
        body.actual_payout_amount,
        "actual_payout_amount",
        errors,
        true
      );
      const memo = trimStr(body.memo, MAX_LONG, "memo", errors, false);
      if (
        !actual_payout_date ||
        actual_payout_amount == null ||
        Object.keys(errors).length
      ) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: {
            actual_payout_date,
            actual_payout_amount,
            memo,
          },
        },
      };
    }
    case "dealer_settlement.correct": {
      const base = parseDealerCreateBody(body, errors);
      const cancel_reason = parseCancelReason(body, errors);
      if (!base || Object.keys(errors).length) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: { ...base, cancel_reason },
        },
      };
    }
    case "supplier_payment.create": {
      const payload = parseSupplierCreateBody(body, errors);
      if (!payload) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId!,
          resource_id: null,
          payload,
        },
      };
    }
    case "supplier_payment.pay": {
      const paid_date = parseDate(body.paid_date, "paid_date", errors, true);
      const paid_amount = parseMoney(
        body.paid_amount,
        "paid_amount",
        errors,
        true
      );
      const memo = trimStr(body.memo, MAX_LONG, "memo", errors, false);
      if (!paid_date || paid_amount == null || Object.keys(errors).length) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: { paid_date, paid_amount, memo },
        },
      };
    }
    case "supplier_payment.correct": {
      const base = parseSupplierCreateBody(body, errors);
      const cancel_reason = parseCancelReason(body, errors);
      if (!base || Object.keys(errors).length) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "入力内容が正しくありません",
          field_errors: errors,
        };
      }
      return {
        ok: true,
        value: {
          action,
          case_id: input.caseId,
          resource_id: input.resourceId!,
          payload: { ...base, cancel_reason },
        },
      };
    }
    default:
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "アクションが不正です",
      };
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key]);
    }
    return out;
  }
  return value;
}

/** テスト用（キーソートした JSON の sha256）。RPC 側の冪等は md5(payload::text)。 */
export function hashMoneyActionPayload(value: ValidatedMoneyAction): string {
  const normalized = JSON.stringify(sortKeysDeep(value));
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * execute_three_party_money RPC へ渡す payload。
 * request_id / case_id / resource_id / action はサーバ注入値のみ。
 */
export function buildThreePartyMoneyRpcPayload(
  requestId: string,
  action: ValidatedMoneyAction
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    request_id: requestId,
    action: action.action,
  };

  switch (action.action) {
    case "finance_receipt.create":
      return {
        ...base,
        case_id: action.case_id,
        ...action.payload,
      };
    case "finance_receipt.confirm":
    case "finance_receipt.cancel":
    case "dealer_settlement.confirm":
    case "dealer_settlement.pay":
    case "dealer_settlement.cancel":
    case "supplier_payment.pay":
    case "supplier_payment.cancel":
      return {
        ...base,
        resource_id: action.resource_id,
        ...action.payload,
      };
    case "finance_receipt.correct":
      return {
        ...base,
        resource_id: action.resource_id,
        ...action.payload,
      };
    case "supplier_payment.correct":
      return {
        ...base,
        resource_id: action.resource_id,
        ...action.payload,
      };
    case "dealer_settlement.create":
    case "dealer_settlement.correct":
      return {
        ...base,
        ...(action.action === "dealer_settlement.create"
          ? { case_id: action.case_id }
          : { resource_id: action.resource_id }),
        dealer_id: action.payload.dealer_id,
        statement_no: action.payload.statement_no,
        issue_date: action.payload.issue_date,
        finance_receipt_id: action.payload.finance_receipt_id,
        invoice_id: action.payload.invoice_id,
        scheduled_payout_date: action.payload.scheduled_payout_date,
        contract_date: action.payload.contract_date,
        delivery_date: action.payload.delivery_date,
        memo: action.payload.memo,
        cancel_reason:
          "cancel_reason" in action.payload
            ? action.payload.cancel_reason
            : undefined,
        credit_received_amount: action.payload.credit_received_amount_calc,
        ve_share_amount: action.payload.ve_share_amount_calc,
        lines: action.payload.lines,
      };
    case "supplier_payment.create":
      return {
        ...base,
        case_id: action.case_id,
        ...action.payload,
      };
    default:
      return base;
  }
}
