import type { CreateProductSetupResult } from "./createProductSetupCore";

export function toSafeProductSetupError(input: {
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

export function toSafeProductSetupSuccess(input: {
  request_id: string;
  product_id: string;
  purchase_price_ids: string[];
  sales_price_ids: string[];
  idempotent_replay?: boolean;
}): {
  ok: true;
  request_id: string;
  product_id: string;
  purchase_price_ids: string[];
  sales_price_ids: string[];
  idempotent_replay: boolean;
} {
  return {
    ok: true,
    request_id: input.request_id,
    product_id: input.product_id,
    purchase_price_ids: [...input.purchase_price_ids],
    sales_price_ids: [...input.sales_price_ids],
    idempotent_replay: input.idempotent_replay === true,
  };
}

export type { CreateProductSetupResult };
