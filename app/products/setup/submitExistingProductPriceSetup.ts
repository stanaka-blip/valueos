/**
 * 既存商品への価格一括追加クライアント。
 */

import { createIdempotencyKey } from "@/app/components/case-registration/submitCaseRegistration";
import { safeUserErrorMessage } from "@/app/components/case-registration/validation";
import type { CreateExistingProductPriceSetupBody } from "@/lib/productSetup/createExistingProductPriceSetupLogic";

export type SubmitExistingProductPriceSetupResult =
  | {
      ok: true;
      product_id: string;
      purchase_price_ids: string[];
      sales_price_ids: string[];
      idempotent_replay?: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

export { createIdempotencyKey };

export async function submitExistingProductPriceSetup(options: {
  body: CreateExistingProductPriceSetupBody;
  idempotencyKey: string;
}): Promise<SubmitExistingProductPriceSetupResult> {
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

  const res = await fetch("/api/product-price-setups", {
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
    product_id?: string;
    purchase_price_ids?: string[];
    sales_price_ids?: string[];
    idempotent_replay?: boolean;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (res.ok && data.ok && typeof data.product_id === "string") {
    return {
      ok: true,
      product_id: data.product_id,
      purchase_price_ids: Array.isArray(data.purchase_price_ids)
        ? data.purchase_price_ids
        : [],
      sales_price_ids: Array.isArray(data.sales_price_ids)
        ? data.sales_price_ids
        : [],
      idempotent_replay: data.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: safeUserErrorMessage(
      data.error_code,
      data.error_message || "価格セットアップを登録できませんでした"
    ),
    field_errors: data.field_errors,
  };
}
