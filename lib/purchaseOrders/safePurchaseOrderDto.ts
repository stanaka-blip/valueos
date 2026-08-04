import type {
  CreatedPurchaseOrder,
  CreatePurchaseOrdersResult,
} from "./createPurchaseOrdersCore";

export function toSafePurchaseOrderError(input: {
  error_code: string;
  error_message: string;
  field_errors?: Record<string, string>;
  request_id?: string;
}): {
  ok: false;
  error_code: string;
  error_message: string;
  field_errors?: Record<string, string>;
  request_id?: string;
} {
  return {
    ok: false,
    error_code: input.error_code,
    error_message: input.error_message,
    ...(input.field_errors ? { field_errors: input.field_errors } : {}),
    ...(input.request_id ? { request_id: input.request_id } : {}),
  };
}

export function toSafePurchaseOrderSuccess(input: {
  request_id: string;
  case_id: string;
  orders: CreatedPurchaseOrder[];
  idempotent_replay?: boolean;
}): {
  ok: true;
  request_id: string;
  case_id: string;
  orders: CreatedPurchaseOrder[];
  idempotent_replay: boolean;
} {
  return {
    ok: true,
    request_id: input.request_id,
    case_id: input.case_id,
    orders: input.orders.map((o) => ({
      id: o.id,
      order_no: o.order_no,
      supplier_id: o.supplier_id,
      order_amount: o.order_amount,
      item_count: o.item_count,
    })),
    idempotent_replay: input.idempotent_replay === true,
  };
}

export type { CreatePurchaseOrdersResult };
