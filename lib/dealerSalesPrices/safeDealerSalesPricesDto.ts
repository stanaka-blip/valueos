export function toSafeDealerSalesPricesError(input: {
  error_code: string;
  error_message: string;
  field_errors?: Record<string, string>;
  request_id?: string;
}) {
  return {
    ok: false as const,
    error_code: input.error_code,
    error_message: input.error_message,
    ...(input.field_errors ? { field_errors: input.field_errors } : {}),
    ...(input.request_id ? { request_id: input.request_id } : {}),
  };
}

export function toSafeDealerSalesPricesSuccess(input: {
  request_id: string;
  dealer_id: string;
  sales_price_ids: string[];
  item_count: number;
  idempotent_replay?: boolean;
}) {
  return {
    ok: true as const,
    request_id: input.request_id,
    dealer_id: input.dealer_id,
    sales_price_ids: [...input.sales_price_ids],
    item_count: input.item_count,
    idempotent_replay: input.idempotent_replay === true,
  };
}
