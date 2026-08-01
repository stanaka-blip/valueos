/**
 * ValueOS 決済区分別 Workflow の型定義。
 * ルール本体は SETTLEMENT_RULES（設定オブジェクト）に置く。
 */

export type WorkflowStatusField = "loan_status" | "card_status";

/** 条件は設定で増やせる。エンジンは type を解釈するだけ。 */
export type WorkflowCondition =
  | { type: "settlement_confirmed" }
  | {
      /** 将来拡張: 請求・入金データから前金入金を判定 */
      type: "payment_confirmed_from_billing";
    }
  | {
      type: "status_in";
      field: WorkflowStatusField;
      values: readonly string[];
    }
  | { type: "completion_date_set" }
  | { type: "all_orders_delivered" };

export type WorkflowPhase = {
  id: string;
  /** 画面表示用の現在状態 */
  currentState: string;
  /**
   * この条件がすべて満たされるまでこのフェーズに留まる。
   * 空配列 = 到達した時点で終端フェーズ。
   */
  completeWhen: readonly WorkflowCondition[];
  assignee: string;
  nextAction: string;
};

export type SettlementDatePolicy = {
  /** 全発注納品済となった日（最終納品日）を起点に計算 */
  trigger: "all_orders_delivered";
  closing: "end_of_month";
  paymentDue: "end_of_next_month";
};

export type SettlementRule = {
  /** SETTLEMENT_RULES のキー（例: 前金） */
  key: string;
  label: string;
  /** DB に保存されうる別名（3社間決済 / ローン / 三社間決済 / 掛売 / 売掛 など） */
  aliases: readonly string[];
  canOrderWhen: readonly WorkflowCondition[];
  canInvoiceWhen: readonly WorkflowCondition[];
  phases: readonly WorkflowPhase[];
  datePolicy?: SettlementDatePolicy;
};

export type WorkflowOrderInput = {
  id: string;
  status: string | null;
  deliveredDate: string | null;
};

export type WorkflowInvoiceInput = {
  id: string;
  status: string | null;
  invoiceAmount: number;
};

export type WorkflowPaymentInput = {
  id: string;
  invoiceId: string | null;
  status: string | null;
  paymentAmount: number;
};

export type WorkflowContext = {
  settlementType: string | null;
  loanStatus: string | null;
  cardStatus: string | null;
  depositAmount: number | null;
  constructionCompletedDate: string | null;
  orders: readonly WorkflowOrderInput[];
  invoices: readonly WorkflowInvoiceInput[];
  payments: readonly WorkflowPaymentInput[];
};

export type WorkflowResult = {
  ruleKey: string | null;
  currentState: string;
  assignee: string;
  nextAction: string;
  canOrder: boolean;
  canInvoice: boolean;
  warnings: string[];
  billingClosingDate: string | null;
  paymentDueDate: string | null;
};
