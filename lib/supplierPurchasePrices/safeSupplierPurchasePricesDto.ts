export function toSafeSupplierPurchasePricesError(input: {
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

export function toSafeSupplierPurchasePricesSuccess(input: {
  request_id: string;
  supplier_id: string;
  purchase_price_ids: string[];
  item_count: number;
  idempotent_replay?: boolean;
}) {
  return {
    ok: true as const,
    request_id: input.request_id,
    supplier_id: input.supplier_id,
    purchase_price_ids: [...input.purchase_price_ids],
    item_count: input.item_count,
    idempotent_replay: input.idempotent_replay === true,
  };
}
