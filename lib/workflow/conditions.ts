import { endOfMonth, endOfNextMonth } from "@/lib/workflow/dates";
import { isPaymentConfirmedFromBilling } from "@/lib/workflow/paymentConfirmation";
import type {
  WorkflowCondition,
  WorkflowContext,
  WorkflowOrderInput,
} from "@/lib/workflow/types";

const CANCELLED_ORDER_STATUSES = new Set(["キャンセル", "取消"]);

export function activeOrders(
  orders: readonly WorkflowOrderInput[]
): WorkflowOrderInput[] {
  return orders.filter(
    (o) => !CANCELLED_ORDER_STATUSES.has((o.status || "").trim())
  );
}

/** 案件内の全発注が納品済か（発注0件は未達） */
export function areAllOrdersDelivered(
  orders: readonly WorkflowOrderInput[]
): boolean {
  const list = activeOrders(orders);
  if (list.length === 0) return false;
  return list.every((o) => (o.status || "").trim() === "納品済");
}

/** 全発注が納品済のときの請求トリガー日 = 納品日の最大 */
export function allOrdersDeliveredTriggerDate(
  orders: readonly WorkflowOrderInput[]
): string | null {
  if (!areAllOrdersDelivered(orders)) return null;
  const dates = activeOrders(orders)
    .map((o) => (o.deliveredDate || "").trim())
    .filter(Boolean)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

export function evaluateCondition(
  condition: WorkflowCondition,
  ctx: WorkflowContext,
  opts: { settlementConfirmed: boolean }
): boolean {
  switch (condition.type) {
    case "settlement_confirmed":
      return opts.settlementConfirmed;
    case "payment_confirmed_from_billing":
      return isPaymentConfirmedFromBilling(ctx);
    case "status_in": {
      const current =
        condition.field === "loan_status"
          ? (ctx.loanStatus || "").trim()
          : (ctx.cardStatus || "").trim();
      return condition.values.includes(current);
    }
    case "completion_date_set":
      return Boolean((ctx.constructionCompletedDate || "").trim());
    case "all_orders_delivered":
      return areAllOrdersDelivered(ctx.orders);
    default: {
      const _exhaustive: never = condition;
      return _exhaustive;
    }
  }
}

export function evaluateAllConditions(
  conditions: readonly WorkflowCondition[],
  ctx: WorkflowContext,
  opts: { settlementConfirmed: boolean }
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, ctx, opts));
}

export function computeCreditDates(orders: readonly WorkflowOrderInput[]): {
  billingClosingDate: string | null;
  paymentDueDate: string | null;
} {
  const trigger = allOrdersDeliveredTriggerDate(orders);
  if (!trigger) {
    return { billingClosingDate: null, paymentDueDate: null };
  }
  return {
    billingClosingDate: endOfMonth(trigger),
    paymentDueDate: endOfNextMonth(trigger),
  };
}
