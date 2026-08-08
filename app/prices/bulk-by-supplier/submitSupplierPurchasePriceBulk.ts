import { createIdempotencyKey } from "@/app/components/case-registration/submitCaseRegistration";
import { safeUserErrorMessage } from "@/app/components/case-registration/validation";
import type { CreateSupplierPurchasePricesBody } from "@/lib/supplierPurchasePrices/createSupplierPurchasePricesLogic";

export type SubmitSupplierPurchasePriceBulkResult =
  | {
      ok: true;
      supplier_id: string;
      purchase_price_ids: string[];
      item_count: number;
      idempotent_replay?: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

export { createIdempotencyKey };

export async function submitSupplierPurchasePriceBulk(options: {
  body: CreateSupplierPurchasePricesBody;
  idempotencyKey: string;
}): Promise<SubmitSupplierPurchasePriceBulkResult> {
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

  const res = await fetch("/api/supplier-purchase-price-bulks", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfData.csrfToken,
      "Idempotency-Key": options.idempotencyKey,
    },
    body: JSON.stringify(options.body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    supplier_id?: string;
    purchase_price_ids?: string[];
    item_count?: number;
    idempotent_replay?: boolean;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (res.ok && data.ok && typeof data.supplier_id === "string") {
    return {
      ok: true,
      supplier_id: data.supplier_id,
      purchase_price_ids: Array.isArray(data.purchase_price_ids)
        ? data.purchase_price_ids
        : [],
      item_count:
        typeof data.item_count === "number"
          ? data.item_count
          : data.purchase_price_ids?.length || 0,
      idempotent_replay: data.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: safeUserErrorMessage(
      data.error_code,
      data.error_message || "仕入価格を一括登録できませんでした"
    ),
    field_errors: data.field_errors,
  };
}
