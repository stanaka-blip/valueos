import {
  CARD_SUCCESS_STATUSES,
  LOAN_APPROVED_STATUSES,
} from "@/lib/workflow/statusCatalog";
import type { SettlementRule } from "@/lib/workflow/types";

/**
 * 決済区分別業務ルール（設定オブジェクト）。
 * ハードコードした if/else 分岐ではなく、ここを増やして拡張する。
 */
export const SETTLEMENT_RULES = {
  前金: {
    key: "前金",
    label: "前金",
    aliases: ["前金"],
    canOrderWhen: [{ type: "payment_confirmed_from_billing" }],
    canInvoiceWhen: [{ type: "settlement_confirmed" }],
    phases: [
      {
        id: "settlement",
        currentState: "決済条件未設定",
        completeWhen: [{ type: "settlement_confirmed" }],
        assignee: "経理",
        nextAction: "決済条件を確定してください",
      },
      {
        id: "awaiting_payment",
        currentState: "入金確認待ち",
        completeWhen: [{ type: "payment_confirmed_from_billing" }],
        assignee: "経理",
        nextAction: "請求登録・入金確認を行ってください",
      },
      {
        id: "orderable",
        currentState: "発注可能",
        completeWhen: [],
        assignee: "発注担当",
        nextAction: "発注を登録してください",
      },
    ],
  },
  売掛: {
    key: "売掛",
    label: "売掛",
    aliases: ["売掛", "掛売"],
    canOrderWhen: [{ type: "settlement_confirmed" }],
    canInvoiceWhen: [{ type: "all_orders_delivered" }],
    phases: [
      {
        id: "settlement",
        currentState: "決済条件未設定",
        completeWhen: [{ type: "settlement_confirmed" }],
        assignee: "経理",
        nextAction: "決済条件を確定してください",
      },
      {
        id: "orderable",
        currentState: "発注可能",
        completeWhen: [{ type: "all_orders_delivered" }],
        assignee: "発注担当",
        nextAction: "発注・納品を進めてください",
      },
      {
        id: "billable",
        currentState: "請求可能（全発注納品済）",
        completeWhen: [],
        assignee: "経理",
        nextAction: "請求登録を行ってください",
      },
    ],
    datePolicy: {
      trigger: "all_orders_delivered",
      closing: "end_of_month",
      paymentDue: "end_of_next_month",
    },
  },
  ローン: {
    key: "ローン",
    label: "ローン（3社間）",
    aliases: ["ローン", "三社間決済", "3社間", "三社間"],
    canOrderWhen: [
      {
        type: "status_in",
        field: "loan_status",
        values: LOAN_APPROVED_STATUSES,
      },
    ],
    canInvoiceWhen: [{ type: "completion_date_set" }],
    phases: [
      {
        id: "settlement",
        currentState: "決済条件未設定",
        completeWhen: [{ type: "settlement_confirmed" }],
        assignee: "経理",
        nextAction: "決済条件を確定してください",
      },
      {
        id: "awaiting_loan",
        currentState: "ローン承認待ち",
        completeWhen: [
          {
            type: "status_in",
            field: "loan_status",
            values: LOAN_APPROVED_STATUSES,
          },
        ],
        assignee: "経理",
        nextAction: "ローン承認ステータスを更新してください",
      },
      {
        id: "awaiting_completion",
        currentState: "完工報告待ち",
        completeWhen: [{ type: "completion_date_set" }],
        assignee: "営業事務",
        nextAction: "完工日を登録してください",
      },
      {
        id: "billable",
        currentState: "請求可能",
        completeWhen: [],
        assignee: "経理",
        nextAction: "請求登録・入金確認を行ってください",
      },
    ],
  },
  カード: {
    key: "カード",
    label: "カード",
    aliases: ["カード"],
    canOrderWhen: [
      {
        type: "status_in",
        field: "card_status",
        values: CARD_SUCCESS_STATUSES,
      },
    ],
    canInvoiceWhen: [
      {
        type: "status_in",
        field: "card_status",
        values: CARD_SUCCESS_STATUSES,
      },
    ],
    phases: [
      {
        id: "settlement",
        currentState: "決済条件未設定",
        completeWhen: [{ type: "settlement_confirmed" }],
        assignee: "経理",
        nextAction: "決済条件を確定してください",
      },
      {
        id: "awaiting_card",
        currentState: "カード決済待ち",
        completeWhen: [
          {
            type: "status_in",
            field: "card_status",
            values: CARD_SUCCESS_STATUSES,
          },
        ],
        assignee: "経理",
        nextAction: "カード決済ステータスを更新してください",
      },
      {
        id: "ready",
        currentState: "発注・請求可能",
        completeWhen: [],
        assignee: "発注担当",
        nextAction: "発注登録・請求登録を進めてください",
      },
    ],
  },
} as const satisfies Record<string, SettlementRule>;

export type SettlementRuleKey = keyof typeof SETTLEMENT_RULES;

export const SETTLEMENT_RULE_LIST: SettlementRule[] = Object.values(
  SETTLEMENT_RULES
);
