/**
 * 発注管理キュー（/queues/orders）の純関数。
 * DB I/O なし。表示対象判定・並び・決済ガード文言。
 */

import {
  isActiveCaseStatus,
  isActiveOrderStatus,
} from "@/lib/status/activeRecords";
import { buildWorkflowContext } from "@/lib/workflow/buildContext";
import { evaluateWorkflow } from "@/lib/workflow/WorkflowEngine";
import type { WorkflowResult } from "@/lib/workflow/types";

export type OrderQueueCaseInput = {
  id: string;
  case_no: string | null;
  status: string | null;
  customer_name: string | null;
  order_received_date: string | null;
  construction_desired_date: string | null;
  dealer_name: string | null;
  settlement_type: string | null;
  has_orderable_targets: boolean;
  active_order_count: number;
};

export type OrderQueueRow = {
  id: string;
  caseNo: string;
  customerName: string;
  dealerName: string;
  constructionDate: string | null;
  orderReceivedDate: string | null;
  settlementType: string;
  canOrder: boolean;
  blockReason: string | null;
  detailHref: string;
  orderHref: string;
};

/** PRODUCT行のみ（line_type=PACKAGE / product_idなしは除外）。buildOrderLines.isProductCaseLine と同趣旨 */
function isProductOrderTarget(row: {
  line_type?: string | null;
  product_id?: string | null;
}): boolean {
  const lt = String(row.line_type || "").trim().toUpperCase();
  if (lt === "PACKAGE") return false;
  return Boolean(row.product_id);
}

export function caseHasOrderableTargets(input: {
  caseProducts: ReadonlyArray<{
    line_type?: string | null;
    product_id?: string | null;
  }>;
  casePackages: ReadonlyArray<{ id: string }>;
}): boolean {
  if (input.caseProducts.some((row) => isProductOrderTarget(row))) {
    return true;
  }
  return input.casePackages.length > 0;
}

export function countActiveOrders(
  orders: ReadonlyArray<{ status?: string | null }>
): number {
  return orders.filter((o) => isActiveOrderStatus(o.status)).length;
}

/** キュー表示対象（決済可否は問わない） */
export function isOrderQueueCandidate(input: {
  caseStatus: string | null | undefined;
  hasOrderableTargets: boolean;
  activeOrderCount: number;
}): boolean {
  if (!isActiveCaseStatus(input.caseStatus)) return false;
  if (!input.hasOrderableTargets) return false;
  if (input.activeOrderCount > 0) return false;
  return true;
}

/**
 * キュー上の発注ボタン制御用の短い理由。
 * 発注画面本体の保存ロジックは変更しない。
 */
export function resolveOrderQueueBlockReason(
  workflow: WorkflowResult
): string | null {
  if (workflow.canOrder) return null;

  if (workflow.ruleKey === null) {
    if (workflow.warnings.includes("決済区分が未設定です")) {
      return "決済区分未設定";
    }
    return workflow.warnings[0] || "決済条件を確認してください";
  }

  switch (workflow.ruleKey) {
    case "前金":
      return "前金未入金";
    case "カード":
      return "カード決済待ち";
    case "3社間決済":
      return "審査承認待ち";
    case "売掛":
      return workflow.warnings[0] || "発注できません";
    default:
      return workflow.warnings[0] || "発注できません";
  }
}

export function evaluateOrderQueueGate(input: {
  settlement: Parameters<typeof buildWorkflowContext>[0]["settlement"];
  constructionCompletedDate?: string | null;
  orders?: Parameters<typeof buildWorkflowContext>[0]["orders"];
  invoices?: Parameters<typeof buildWorkflowContext>[0]["invoices"];
  payments?: Parameters<typeof buildWorkflowContext>[0]["payments"];
}): { canOrder: boolean; blockReason: string | null; settlementType: string } {
  const ctx = buildWorkflowContext({
    settlement: input.settlement,
    constructionCompletedDate: input.constructionCompletedDate ?? null,
    orders: input.orders || [],
    invoices: input.invoices || [],
    payments: input.payments || [],
  });
  const workflow = evaluateWorkflow(ctx);
  return {
    canOrder: workflow.canOrder,
    blockReason: resolveOrderQueueBlockReason(workflow),
    settlementType: ctx.settlementType?.trim() || "未設定",
  };
}

function dateSortKey(value: string | null | undefined): number {
  const v = (value || "").trim();
  if (!v) return Number.POSITIVE_INFINITY;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** 工事日近い順 → 未設定最後 → 受付日古い順 → 案件番号順 */
export function sortOrderQueueRows<
  T extends {
    constructionDate: string | null;
    orderReceivedDate: string | null;
    caseNo: string;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const c = dateSortKey(a.constructionDate) - dateSortKey(b.constructionDate);
    if (c !== 0) return c;
    const r =
      dateSortKey(a.orderReceivedDate) - dateSortKey(b.orderReceivedDate);
    if (r !== 0) return r;
    return a.caseNo.localeCompare(b.caseNo, "ja");
  });
}

export function buildOrderQueueRow(
  input: OrderQueueCaseInput,
  gate: { canOrder: boolean; blockReason: string | null; settlementType: string }
): OrderQueueRow | null {
  if (
    !isOrderQueueCandidate({
      caseStatus: input.status,
      hasOrderableTargets: input.has_orderable_targets,
      activeOrderCount: input.active_order_count,
    })
  ) {
    return null;
  }

  return {
    id: input.id,
    caseNo: input.case_no || "—",
    customerName: input.customer_name || "—",
    dealerName: input.dealer_name || "—",
    constructionDate: input.construction_desired_date,
    orderReceivedDate: input.order_received_date,
    settlementType: gate.settlementType || input.settlement_type || "未設定",
    canOrder: gate.canOrder,
    blockReason: gate.canOrder ? null : gate.blockReason,
    detailHref: `/cases/${input.id}`,
    orderHref: `/cases/${input.id}/orders/new`,
  };
}
