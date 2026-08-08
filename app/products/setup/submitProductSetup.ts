/**
 * 商品セットアップクライアント。
 * CSRF 取得 → POST /api/product-setups（Idempotency-Key 付き）。
 */

import { createIdempotencyKey } from "@/app/components/case-registration/submitCaseRegistration";
import { safeUserErrorMessage } from "@/app/components/case-registration/validation";
import type { CreateProductSetupBody } from "@/lib/productSetup/createProductSetupLogic";

export type SubmitProductSetupResult =
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

function safeProductSetupUserErrorMessage(
  errorCode?: string,
  errorMessage?: string
): string {
  if (errorCode === "DUPLICATE_PRODUCT") {
    return "同じメーカー・同じ型番の商品がすでに登録されています。";
  }
  if (errorCode === "PRODUCT_SETUP_FAILED") {
    return "商品セットアップを登録できませんでした";
  }
  if (errorCode === "REQUEST_IN_PROGRESS") {
    return "同じリクエストの処理が進行中です。しばらくしてから再度お試しください。";
  }
  if (errorCode === "NOT_FOUND") {
    return errorMessage || "参照先マスタが見つかりません";
  }
  return safeUserErrorMessage(
    errorCode,
    errorMessage || "商品セットアップを登録できませんでした"
  );
}

export async function submitProductSetup(options: {
  body: CreateProductSetupBody;
  idempotencyKey: string;
}): Promise<SubmitProductSetupResult> {
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
      error_message: safeProductSetupUserErrorMessage(
        csrfData.error_code,
        csrfData.error_message || "認証が必要です"
      ),
    };
  }

  const res = await fetch("/api/product-setups", {
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
    error_message: safeProductSetupUserErrorMessage(
      data.error_code,
      data.error_message
    ),
    field_errors: data.field_errors,
  };
}
