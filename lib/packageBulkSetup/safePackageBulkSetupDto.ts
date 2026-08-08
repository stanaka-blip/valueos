export function toSafePackageBulkSetupError(input: {
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

export function toSafePackageBulkSetupSuccess(input: {
  request_id: string;
  manufacturer_id: string;
  series_id: string | null;
  package_ids: string[];
  package_count: number;
  idempotent_replay?: boolean;
}) {
  return {
    ok: true as const,
    request_id: input.request_id,
    manufacturer_id: input.manufacturer_id,
    series_id: input.series_id,
    package_ids: [...input.package_ids],
    package_count: input.package_count,
    idempotent_replay: input.idempotent_replay === true,
  };
}
