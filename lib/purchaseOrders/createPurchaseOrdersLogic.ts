/**
 * 仕入発注一括作成 API の入力検証・RPC payload 構築（純関数）。
 */

export type PurchaseOrderItemInput = {
  product_id: string;
  case_product_id?: string | null;
  quantity: number;
  unit_price: number;
  memo?: string | null;
  sort_order?: number;
};

export type PurchaseOrderBucketInput = {
  supplier_id: string;
  order_no: string;
  items: PurchaseOrderItemInput[];
};

export type CreatePurchaseOrdersBody = {
  order_date: string;
  expected_delivery_date?: string | null;
  delivered_date?: string | null;
  status: string;
  memo?: string | null;
  case_status?: string | null;
  orders: PurchaseOrderBucketInput[];
};

export type PurchaseOrderFieldErrors = Record<string, string>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function validateCreatePurchaseOrdersBody(
  body: unknown
):
  | { ok: true; value: CreatePurchaseOrdersBody }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: PurchaseOrderFieldErrors;
    } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
    };
  }

  const input = body as Record<string, unknown>;
  const field_errors: PurchaseOrderFieldErrors = {};

  const order_date =
    typeof input.order_date === "string" ? input.order_date.trim() : "";
  if (!DATE_RE.test(order_date)) {
    field_errors.order_date = "発注日を入力してください";
  }

  let expected_delivery_date: string | null = null;
  if (
    input.expected_delivery_date != null &&
    String(input.expected_delivery_date).trim() !== ""
  ) {
    const v = String(input.expected_delivery_date).trim();
    if (!DATE_RE.test(v)) {
      field_errors.expected_delivery_date = "納品予定日が不正です";
    } else {
      expected_delivery_date = v;
    }
  }

  let delivered_date: string | null = null;
  if (
    input.delivered_date != null &&
    String(input.delivered_date).trim() !== ""
  ) {
    const v = String(input.delivered_date).trim();
    if (!DATE_RE.test(v)) {
      field_errors.delivered_date = "納品日が不正です";
    } else {
      delivered_date = v;
    }
  }

  const status =
    typeof input.status === "string" ? input.status.trim() : "";
  if (!status) {
    field_errors.status = "発注ステータスを入力してください";
  }

  const memo =
    input.memo == null || String(input.memo).trim() === ""
      ? null
      : String(input.memo).trim();

  const case_status =
    input.case_status == null || String(input.case_status).trim() === ""
      ? null
      : String(input.case_status).trim();

  if (
    expected_delivery_date &&
    order_date &&
    expected_delivery_date < order_date
  ) {
    field_errors.expected_delivery_date =
      "納品予定日は発注日以降に設定してください";
  }

  if (!Array.isArray(input.orders) || input.orders.length < 1) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "発注が1件以上必要です",
      field_errors: Object.keys(field_errors).length
        ? field_errors
        : undefined,
    };
  }

  if (input.orders.length > 50) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "発注件数が上限を超えています",
    };
  }

  const seenSuppliers = new Set<string>();
  const seenOrderNos = new Set<string>();
  const orders: PurchaseOrderBucketInput[] = [];

  for (let i = 0; i < input.orders.length; i += 1) {
    const raw = input.orders[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "発注内容が不正です",
      };
    }
    const row = raw as Record<string, unknown>;
    const supplier_id =
      typeof row.supplier_id === "string" ? row.supplier_id.trim() : "";
    if (!isUuid(supplier_id)) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "仕入先を選択してください",
      };
    }
    if (seenSuppliers.has(supplier_id)) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "同じ仕入先の発注が重複しています",
      };
    }
    seenSuppliers.add(supplier_id);

    const order_no =
      typeof row.order_no === "string" ? row.order_no.trim() : "";
    if (!order_no) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "発注番号を入力してください",
      };
    }
    if (seenOrderNos.has(order_no)) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "発注番号がリクエスト内で重複しています",
      };
    }
    seenOrderNos.add(order_no);

    if (!Array.isArray(row.items) || row.items.length < 1) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "発注明細がありません",
      };
    }

    const items: PurchaseOrderItemInput[] = [];
    for (let j = 0; j < row.items.length; j += 1) {
      const itemRaw = row.items[j];
      if (!itemRaw || typeof itemRaw !== "object" || Array.isArray(itemRaw)) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "発注明細が不正です",
        };
      }
      const item = itemRaw as Record<string, unknown>;
      const product_id =
        typeof item.product_id === "string" ? item.product_id.trim() : "";
      if (!isUuid(product_id)) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "商品が紐づいていない明細があります",
        };
      }

      let case_product_id: string | null = null;
      if (
        item.case_product_id != null &&
        String(item.case_product_id).trim() !== ""
      ) {
        const cp = String(item.case_product_id).trim();
        if (!isUuid(cp)) {
          return {
            ok: false,
            error_code: "INVALID_INPUT",
            error_message: "案件商品参照が不正です",
          };
        }
        case_product_id = cp;
      }

      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "数量は1以上の整数で入力してください",
        };
      }

      if (item.unit_price === null || item.unit_price === undefined || item.unit_price === "") {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "仕入単価が未設定の明細があります",
        };
      }
      const unit_price = Number(item.unit_price);
      if (!Number.isInteger(unit_price) || unit_price < 0) {
        return {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "仕入単価は0以上の整数で入力してください",
        };
      }

      const itemMemo =
        item.memo == null || String(item.memo).trim() === ""
          ? null
          : String(item.memo).trim();

      items.push({
        product_id,
        case_product_id,
        quantity,
        unit_price,
        memo: itemMemo,
        sort_order:
          typeof item.sort_order === "number" && Number.isInteger(item.sort_order)
            ? item.sort_order
            : j,
      });
    }

    orders.push({
      supplier_id,
      order_no,
      items,
    });
  }

  if (Object.keys(field_errors).length > 0) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message: "入力内容が正しくありません",
      field_errors,
    };
  }

  return {
    ok: true,
    value: {
      order_date,
      expected_delivery_date,
      delivered_date,
      status,
      memo,
      case_status,
      orders,
    },
  };
}

export function buildCreatePurchaseOrdersRpcPayload(
  caseId: string,
  requestId: string,
  body: CreatePurchaseOrdersBody
): Record<string, unknown> {
  return {
    request_id: requestId,
    case_id: caseId,
    case_status: body.case_status,
    orders: body.orders.map((order) => ({
      supplier_id: order.supplier_id,
      order_no: order.order_no,
      order_date: body.order_date,
      expected_delivery_date: body.expected_delivery_date,
      delivered_date: body.delivered_date,
      status: body.status,
      memo: body.memo,
      items: order.items.map((item) => ({
        product_id: item.product_id,
        case_product_id: item.case_product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        memo: item.memo,
        sort_order: item.sort_order ?? 0,
      })),
    })),
  };
}
