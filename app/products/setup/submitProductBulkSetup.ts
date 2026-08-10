import { createIdempotencyKey } from "@/app/components/case-registration/submitCaseRegistration";
import { safeUserErrorMessage } from "@/app/components/case-registration/validation";
import type { CreateProductBulkSetupBody } from "@/lib/productBulkSetup/createProductBulkSetupLogic";

export type SubmitProductBulkSetupResult =
  | {
      ok: true;
      manufacturer_id: string;
      product_ids: string[];
      product_count: number;
      idempotent_replay?: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

export { createIdempotencyKey };

export async function submitProductBulkSetup(options: {
  body: CreateProductBulkSetupBody;
  idempotencyKey: string;
}): Promise<SubmitProductBulkSetupResult> {
  const csrfRes = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const csrfData = (await csrfRes.json().catch(() => ({}))) as {
    csrfToken?: string;
    error_code?: string;
    error_message?: string;
  };
  if (!csrfRes.ok || !csrfData.csrfToken) {
    return {
      ok: false,
      error_code: csrfData.error_code,
      error_message: safeUserErrorMessage(
        csrfData.error_code,
        csrfData.error_message || "認証が必要です"
      ),
    };
  }

  const res = await fetch("/api/product-bulk-setups", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfData.csrfToken,
      "Idempotency-Key": options.idempotencyKey,
      Origin: window.location.origin,
    },
    body: JSON.stringify(options.body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    manufacturer_id?: string;
    product_ids?: string[];
    product_count?: number;
    idempotent_replay?: boolean;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (res.ok && data.ok && typeof data.manufacturer_id === "string") {
    return {
      ok: true,
      manufacturer_id: data.manufacturer_id,
      product_ids: Array.isArray(data.product_ids) ? data.product_ids : [],
      product_count:
        typeof data.product_count === "number"
          ? data.product_count
          : data.product_ids?.length || 0,
      idempotent_replay: data.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: safeUserErrorMessage(
      data.error_code,
      data.error_message || "商品を一括登録できませんでした"
    ),
    field_errors: data.field_errors,
  };
}
