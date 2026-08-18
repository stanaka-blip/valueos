/**
 * 発注編集の保存契約（純関数）。
 * - パッケージ AMT/COMP 行は削除不可
 * - COMP の仕入単価・金額は常に 0。パッケージ仕入額は AMT 行のみ
 * - 通常商品は追加・削除・単価変更可
 * - ヘッダ更新 + 明細置換 + order_amount 再計算は同一トランザクション前提
 */

import {
  canDeleteOrderEditLine,
  canEditOrderLineUnitPrice,
  isProtectedPackageOrderLine,
  resolveOrderPackageLineKind,
} from "@/lib/orders/orderPackageDisplay";

export type ReplacePurchaseOrderExistingItem = {
  id: string;
  product_id?: string | null;
  case_product_id?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  amount?: number | string | null;
  memo?: string | null;
  sort_order?: number | null;
};

export type ReplacePurchaseOrderIncomingItem = {
  id?: string | null;
  product_id?: string | null;
  case_product_id?: string | null;
  quantity: number | string;
  unit_price: number | string;
  memo?: string | null;
  sort_order?: number;
};

export type NormalizedReplacePurchaseOrderItem = {
  id: string | null;
  product_id: string | null;
  case_product_id: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  memo: string | null;
  sort_order: number;
};

export type ReplacePurchaseOrderHeader = {
  expected_delivery_date?: string | null;
  delivered_date?: string | null;
  status: string;
  memo?: string | null;
};

export type ReplacePurchaseOrderStore = {
  order: {
    id: string;
    order_amount: number;
    expected_delivery_date: string | null;
    delivered_date: string | null;
    status: string;
    memo: string | null;
  };
  items: Array<
    ReplacePurchaseOrderExistingItem & {
      id: string;
      quantity: number;
      unit_price: number;
      amount: number;
      memo: string | null;
      sort_order: number;
    }
  >;
};

function toFiniteNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function calcAmount(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice);
}

export function lineAmountForOrderEdit(input: {
  memo?: string | null;
  quantity: number | string;
  unit_price: number | string;
}): number {
  if (resolveOrderPackageLineKind(input.memo) === "PACKAGE_COMPONENT") {
    return 0;
  }
  return calcAmount(toFiniteNumber(input.quantity), toFiniteNumber(input.unit_price));
}

export { canDeleteOrderEditLine, canEditOrderLineUnitPrice };

export function normalizeReplacePurchaseOrderItem(
  line: ReplacePurchaseOrderIncomingItem,
  existingMemo?: string | null
): NormalizedReplacePurchaseOrderItem {
  const memo = (existingMemo ?? line.memo ?? "").trim() || null;
  const kind = resolveOrderPackageLineKind(memo);
  const quantity = Math.floor(toFiniteNumber(line.quantity));
  const rawPrice = toFiniteNumber(line.unit_price);
  const unit_price = kind === "PACKAGE_COMPONENT" ? 0 : rawPrice;
  const amount = kind === "PACKAGE_COMPONENT" ? 0 : calcAmount(quantity, unit_price);
  const id = (line.id || "").trim() || null;
  return {
    id,
    product_id: (line.product_id || "").trim() || null,
    case_product_id: (line.case_product_id || "").trim() || null,
    quantity,
    unit_price,
    amount,
    memo,
    sort_order: Number.isFinite(Number(line.sort_order))
      ? Number(line.sort_order)
      : 0,
  };
}

export function validateReplacePurchaseOrderItems(
  existing: ReadonlyArray<ReplacePurchaseOrderExistingItem>,
  incoming: ReadonlyArray<ReplacePurchaseOrderIncomingItem>
):
  | { ok: true; items: NormalizedReplacePurchaseOrderItem[]; orderAmount: number }
  | { ok: false; error_code: "INVALID_INPUT"; error_message: string } {
  if (!incoming || incoming.length === 0) {
    return {
      ok: false,
      error_code: "INVALID_INPUT",
      error_message:
        "発注明細がありません。明細がない発注は金額・納品状態を保存できません。",
    };
  }

  const existingById = new Map(
    existing
      .filter((row) => (row.id || "").trim())
      .map((row) => [row.id, row])
  );

  for (const row of existing) {
    if (!isProtectedPackageOrderLine(row.memo)) continue;
    const found = incoming.find((item) => (item.id || "") === row.id);
    if (!found) {
      const kind = resolveOrderPackageLineKind(row.memo);
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message:
          kind === "PACKAGE_AMOUNT"
            ? "パッケージ金額行は削除できません。"
            : "パッケージ構成行は削除できません。",
      };
    }
  }

  const items: NormalizedReplacePurchaseOrderItem[] = [];
  for (let index = 0; index < incoming.length; index += 1) {
    const line = incoming[index];
    const incomingId = (line.id || "").trim() || null;
    const existingRow = incomingId ? existingById.get(incomingId) : undefined;
    const existingMemo = existingRow?.memo ?? null;

    if (!incomingId && isProtectedPackageOrderLine(line.memo)) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "パッケージ明細は新規追加できません。",
      };
    }

    if (
      existingRow &&
      isProtectedPackageOrderLine(existingRow.memo) &&
      (line.memo || "").trim() !== (existingRow.memo || "").trim()
    ) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "パッケージ明細の内部情報は変更できません。",
      };
    }

    const normalized = normalizeReplacePurchaseOrderItem(
      { ...line, sort_order: line.sort_order ?? index },
      existingMemo
    );

    if (normalized.quantity < 1) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "数量は1以上で入力してください。",
      };
    }
    if (normalized.unit_price < 0) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "単価は0以上で入力してください。",
      };
    }
    if (!normalized.product_id && !incomingId) {
      return {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "追加した明細はメーカー・製品/型番を選択してください。",
      };
    }

    items.push(normalized);
  }

  const orderAmount = items.reduce((sum, item) => sum + item.amount, 0);
  return { ok: true, items, orderAmount };
}

export function applyReplacePurchaseOrderTransaction(
  store: ReplacePurchaseOrderStore,
  input: {
    header: ReplacePurchaseOrderHeader;
    items: ReadonlyArray<ReplacePurchaseOrderIncomingItem>;
  },
  options?: { failAt?: "insert" }
):
  | { ok: true; store: ReplacePurchaseOrderStore }
  | {
      ok: false;
      error_code: "INVALID_INPUT" | "ORDER_UPDATE_FAILED";
      error_message: string;
      store: ReplacePurchaseOrderStore;
    } {
  const snapshot: ReplacePurchaseOrderStore = {
    order: { ...store.order },
    items: store.items.map((item) => ({ ...item })),
  };

  const validated = validateReplacePurchaseOrderItems(store.items, input.items);
  if (!validated.ok) {
    return { ...validated, store: snapshot };
  }

  try {
    const workingOrder = {
      ...store.order,
      expected_delivery_date: input.header.expected_delivery_date ?? null,
      delivered_date: input.header.delivered_date ?? null,
      status: input.header.status,
      memo: input.header.memo ?? null,
    };

    if (options?.failAt === "insert") {
      throw new Error("item insert failed");
    }

    const nextItems = validated.items.map((item, index) => ({
      id: item.id || `new-${index}`,
      product_id: item.product_id,
      case_product_id: item.case_product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
      memo: item.memo,
      sort_order: item.sort_order,
    }));

    return {
      ok: true,
      store: {
        order: {
          ...workingOrder,
          order_amount: validated.orderAmount,
        },
        items: nextItems,
      },
    };
  } catch {
    return {
      ok: false,
      error_code: "ORDER_UPDATE_FAILED",
      error_message: "発注の更新に失敗しました",
      store: snapshot,
    };
  }
}

export function buildReplacePurchaseOrderRpcPayload(input: {
  orderId: string;
  header: ReplacePurchaseOrderHeader;
  items: NormalizedReplacePurchaseOrderItem[];
}): Record<string, unknown> {
  return {
    order_id: input.orderId,
    expected_delivery_date: input.header.expected_delivery_date ?? null,
    delivered_date: input.header.delivered_date ?? null,
    status: input.header.status,
    memo: input.header.memo ?? null,
    items: input.items.map((item, index) => ({
      id: item.id,
      product_id: item.product_id,
      case_product_id: item.case_product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      memo: item.memo,
      sort_order: item.sort_order ?? index,
    })),
  };
}
