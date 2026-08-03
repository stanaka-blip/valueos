/**
 * 案件からの仕入発注一括作成クライアント。
 * CSRF 取得 → POST /api/cases/:id/purchase-orders（Idempotency-Key 付き）。
 */

import { createIdempotencyKey } from "@/app/components/case-registration/submitCaseRegistration";
import { safeUserErrorMessage } from "@/app/components/case-registration/validation";
import type { CreatedPurchaseOrder } from "@/lib/purchaseOrders/createPurchaseOrdersCore";

export type PurchaseOrderSubmitBody = {
  order_date: string;
  expected_delivery_date?: string | null;
  delivered_date?: string | null;
  status: string;
  memo?: string | null;
  case_status?: string | null;
  orders: Array<{
    supplier_id: string;
    order_no: string;
    items: Array<{
      product_id: string;
      case_product_id?: string | null;
      quantity: number;
      unit_price: number;
      memo?: string | null;
      sort_order?: number;
    }>;
  }>;
};

export type SubmitPurchaseOrdersResult =
  | {
      ok: true;
      case_id: string;
      orders: CreatedPurchaseOrder[];
      idempotent_replay?: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

export { createIdempotencyKey };

function safePurchaseOrderUserErrorMessage(
  errorCode?: string,
  errorMessage?: string
): string {
  if (errorCode === "NOT_FOUND") return "案件が見つかりません";
  if (errorCode === "DUPLICATE_ORDER_NO") {
    return "同じ発注番号がすでに登録されています。別の発注番号を入力してください。";
  }
  if (errorCode === "ORDER_CREATE_FAILED") {
    return "発注を登録できませんでした";
  }
  if (errorCode === "REQUEST_IN_PROGRESS") {
    return "同じリクエストの処理が進行中です。しばらくしてから再度お試しください。";
  }
  return safeUserErrorMessage(
    errorCode,
    errorMessage || "発注を登録できませんでした"
  );
}

export async function submitPurchaseOrders(options: {
  caseId: string;
  body: PurchaseOrderSubmitBody;
  idempotencyKey: string;
}): Promise<SubmitPurchaseOrdersResult> {
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
      error_message: safePurchaseOrderUserErrorMessage(
        csrfData.error_code,
        csrfData.error_message || "認証が必要です"
      ),
    };
  }

  const res = await fetch(`/api/cases/${options.caseId}/purchase-orders`, {
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
    case_id?: string;
    orders?: CreatedPurchaseOrder[];
    idempotent_replay?: boolean;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (
    res.ok &&
    data.ok &&
    typeof data.case_id === "string" &&
    Array.isArray(data.orders) &&
    data.orders.length > 0
  ) {
    return {
      ok: true,
      case_id: data.case_id,
      orders: data.orders,
      idempotent_replay: data.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: safePurchaseOrderUserErrorMessage(
      data.error_code,
      data.error_message
    ),
    field_errors: data.field_errors,
  };
}
