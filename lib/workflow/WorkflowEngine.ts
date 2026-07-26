import {
  areAllOrderStatusesDelivered,
  computeCreditDates,
  evaluateAllConditions,
  hasDeliveredStatusMissingDate,
} from "@/lib/workflow/conditions";
import { resolveSettlementRule } from "@/lib/workflow/normalize";
import type {
  SettlementRule,
  WorkflowContext,
  WorkflowPhase,
  WorkflowResult,
} from "@/lib/workflow/types";

/**
 * WorkflowEngine
 * SETTLEMENT_RULES 設定を解釈し、案件の業務状態を返す。
 */
export function evaluateWorkflow(ctx: WorkflowContext): WorkflowResult {
  const rule = resolveSettlementRule(ctx.settlementType);
  const warnings: string[] = [];

  if (!rule) {
    warnings.push(
      ctx.settlementType
        ? `未対応の決済区分です: ${ctx.settlementType}`
        : "決済区分が未設定です"
    );
    return {
      ruleKey: null,
      currentState: "決済条件未設定",
      assignee: "経理",
      nextAction: "決済条件を確定してください",
      canOrder: false,
      canInvoice: false,
      warnings,
      billingClosingDate: null,
      paymentDueDate: null,
    };
  }

  const settlementConfirmed = true; // ルール解決できた = 区分確定済み
  const opts = { settlementConfirmed };

  const canOrder = evaluateAllConditions(rule.canOrderWhen, ctx, opts);
  const canInvoice = evaluateAllConditions(rule.canInvoiceWhen, ctx, opts);
  const phase = resolveCurrentPhase(rule, ctx, opts);

  let billingClosingDate: string | null = null;
  let paymentDueDate: string | null = null;

  if (rule.datePolicy?.trigger === "all_orders_delivered") {
    const dates = computeCreditDates(ctx.orders);
    billingClosingDate = dates.billingClosingDate;
    paymentDueDate = dates.paymentDueDate;
    if (!canInvoice) {
      if (hasDeliveredStatusMissingDate(ctx.orders)) {
        // status=納品済 だが delivered_date 欠損 → 請求不可
        warnings.push("納品日が登録されていません");
      } else if (!areAllOrderStatusesDelivered(ctx.orders)) {
        warnings.push(
          "売掛の請求は、案件内の全発注が納品済になってから可能です"
        );
      }
    }
  }

  if (!canOrder) {
    warnings.push(orderBlockReason(rule, ctx, opts));
  }
  if (!canInvoice && rule.key !== "売掛") {
    warnings.push(invoiceBlockReason(rule, ctx, opts));
  }

  return {
    ruleKey: rule.key,
    currentState: phase.currentState,
    assignee: phase.assignee,
    nextAction: phase.nextAction,
    canOrder,
    canInvoice,
    warnings: unique(warnings.filter(Boolean)),
    billingClosingDate,
    paymentDueDate,
  };
}

function resolveCurrentPhase(
  rule: SettlementRule,
  ctx: WorkflowContext,
  opts: { settlementConfirmed: boolean }
): WorkflowPhase {
  for (const phase of rule.phases) {
    if (phase.completeWhen.length === 0) {
      return phase;
    }
    const done = evaluateAllConditions(phase.completeWhen, ctx, opts);
    if (!done) {
      return phase;
    }
  }
  return rule.phases[rule.phases.length - 1];
}

function orderBlockReason(
  rule: SettlementRule,
  ctx: WorkflowContext,
  opts: { settlementConfirmed: boolean }
): string {
  if (
    rule.canOrderWhen.some((c) => c.type === "payment_confirmed_from_billing")
  ) {
    if (
      !evaluateAllConditions(
        [{ type: "payment_confirmed_from_billing" }],
        ctx,
        opts
      )
    ) {
      return "前金の入金確認前のため発注できません（請求・入金データで判定）";
    }
  }
  if (
    rule.canOrderWhen.some(
      (c) => c.type === "status_in" && c.field === "loan_status"
    )
  ) {
    return "ローン未承認のため発注できません";
  }
  if (
    rule.canOrderWhen.some(
      (c) => c.type === "status_in" && c.field === "card_status"
    )
  ) {
    return "カード決済前のため発注できません";
  }
  return "現在の決済区分ルールでは発注できません";
}

function invoiceBlockReason(
  rule: SettlementRule,
  ctx: WorkflowContext,
  opts: { settlementConfirmed: boolean }
): string {
  if (rule.canInvoiceWhen.some((c) => c.type === "completion_date_set")) {
    if (!evaluateAllConditions([{ type: "completion_date_set" }], ctx, opts)) {
      return "完工日登録前のため請求できません";
    }
  }
  if (
    rule.canInvoiceWhen.some(
      (c) => c.type === "status_in" && c.field === "card_status"
    )
  ) {
    return "カード決済前のため請求できません";
  }
  return "現在の決済区分ルールでは請求できません";
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/** テスト・UI 向けエイリアス */
export const WorkflowEngine = {
  evaluate: evaluateWorkflow,
};
