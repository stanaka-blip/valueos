/**
 * 案件詳細 → 発注登録の明細展開・単価解決（純関数）。
 * PACKAGEヘッダは含めず、構成品のみ展開する。
 */

export type OrderLineDraft = {
  local_id: string;
  product_id: string;
  case_product_id: string | null;
  product_name: string;
  model_no: string;
  quantity: string;
  /** 空文字 = 未設定。 "0" = 実値0円 */
  unit_price: string;
  memo: string;
  sort_order: number;
  /** 有効な案件スナップショット単価がある（マスタで上書きしない） */
  has_case_snapshot: boolean;
  source: "PRODUCT" | "PACKAGE_ITEM";
};

export type CaseProductSource = {
  id: string;
  line_type?: string | null;
  product_id: string | null;
  quantity: number | string | null;
  purchase_price: number | string | null;
  memo: string | null;
  products:
    | { name: string | null; model_no: string | null }
    | { name: string | null; model_no: string | null }[]
    | null;
};

export type CasePackageItemSource = {
  id: string;
  product_id: string | null;
  /** 登録時に「構成数量×パッケージ数量」で保存された発注数量 */
  quantity: number | string | null;
  unit_purchase_price: number | string | null;
  total_purchase_price: number | string | null;
  memo: string | null;
  is_selected: boolean | null;
  is_hidden: boolean | null;
  sort_order: number | null;
  product_name_snapshot: string | null;
  model_no_snapshot: string | null;
  display_name_snapshot: string | null;
  products:
    | { name: string | null; model_no: string | null }
    | { name: string | null; model_no: string | null }[]
    | null;
};

export type CasePackageSource = {
  id: string;
  /** パッケージ数量（構成展開の乗数。items.quantity は既に積で保存） */
  quantity: number | string | null;
  case_package_items:
    | CasePackageItemSource[]
    | CasePackageItemSource
    | null;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

/** 発注数量として有効な正の整数のみ。0/NULL/小数/負は null（1へ補正しない） */
export function parseOrderQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1) return null;
    return n;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      return null;
    }
    return value;
  }
  return null;
}

export function isUnitPriceUnset(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

export function isUnitPriceRealZero(value: string | null | undefined): boolean {
  if (isUnitPriceUnset(value)) return false;
  const n = Number(String(value).trim());
  return Number.isFinite(n) && n === 0;
}

export function parseUnitPriceInput(
  value: string | null | undefined
): number | null {
  if (isUnitPriceUnset(value)) return null;
  const trimmed = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * 案件の仕入合計スナップショットから単価を復元。
 * purchase_price が NULL → 未設定（スナップショットなし）。
 * 0 は実値0として保持する。
 */
export function resolveSnapshotUnitPrice(
  purchaseTotal: unknown,
  quantity: number | null
): { unitPrice: string; hasCaseSnapshot: boolean } {
  if (purchaseTotal === null || purchaseTotal === undefined || purchaseTotal === "") {
    return { unitPrice: "", hasCaseSnapshot: false };
  }
  const total = Number(purchaseTotal);
  if (!Number.isFinite(total)) {
    return { unitPrice: "", hasCaseSnapshot: false };
  }
  if (quantity == null || quantity < 1) {
    return { unitPrice: "", hasCaseSnapshot: false };
  }
  const unit = Math.round(total / quantity);
  if (!Number.isFinite(unit) || unit < 0) {
    return { unitPrice: "", hasCaseSnapshot: false };
  }
  return { unitPrice: String(unit), hasCaseSnapshot: true };
}

export function resolveItemSnapshotUnitPrice(
  unitPurchasePrice: unknown,
  totalPurchasePrice: unknown,
  quantity: number | null
): { unitPrice: string; hasCaseSnapshot: boolean } {
  if (
    unitPurchasePrice !== null &&
    unitPurchasePrice !== undefined &&
    unitPurchasePrice !== ""
  ) {
    const unit = Number(unitPurchasePrice);
    if (Number.isFinite(unit) && unit >= 0 && Number.isInteger(unit)) {
      return { unitPrice: String(unit), hasCaseSnapshot: true };
    }
    if (Number.isFinite(unit) && unit >= 0) {
      return { unitPrice: String(Math.round(unit)), hasCaseSnapshot: true };
    }
  }
  return resolveSnapshotUnitPrice(totalPurchasePrice, quantity);
}

/** PRODUCT行のみ。PACKAGEヘッダ（product_idなし / line_type=PACKAGE）は除外 */
export function isProductCaseLine(row: CaseProductSource): boolean {
  const lt = String(row.line_type || "").trim().toUpperCase();
  if (lt === "PACKAGE") return false;
  return Boolean(row.product_id);
}

/**
 * 構成数量 × パッケージ数量。
 * 両方とも有効な正整数のときのみ積を返す（1へ補正しない）。
 */
export function multiplyComponentAndPackageQty(
  componentQty: unknown,
  packageQty: unknown
): number | null {
  const component = parseOrderQuantity(componentQty);
  const pkg = parseOrderQuantity(packageQty);
  if (component == null || pkg == null) return null;
  const n = component * pkg;
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * PACKAGE構成の発注数量。
 *
 * 登録・明細追加・dealer 保存は case_package_items.quantity に
 * 「構成数量×パッケージ数量」の積を保存する。
 * ここでは再乗算せずその値を使う（0/NULL/不正は1へ補正しない）。
 *
 * componentQuantity が別途取れる場合のみ、明示的に積を優先する。
 */
export function resolvePackageItemOrderQuantity(options: {
  storedItemQuantity: unknown;
  packageQuantity: unknown;
  componentQuantity?: unknown;
}): number | null {
  if (
    options.componentQuantity !== undefined &&
    options.componentQuantity !== null &&
    options.componentQuantity !== ""
  ) {
    const explicit = multiplyComponentAndPackageQty(
      options.componentQuantity,
      options.packageQuantity
    );
    if (explicit != null) return explicit;
  }
  // 保存済みの積（構成×パッケージ）
  return parseOrderQuantity(options.storedItemQuantity);
}

export function buildInitialOrderLines(
  caseProducts: CaseProductSource[],
  casePackages: CasePackageSource[]
): OrderLineDraft[] {
  const lines: OrderLineDraft[] = [];

  for (const row of caseProducts) {
    if (!isProductCaseLine(row)) continue;
    const productId = row.product_id as string;
    const product = getSingleRelation(row.products);
    const quantity = parseOrderQuantity(row.quantity);
    const snap = resolveSnapshotUnitPrice(row.purchase_price, quantity);

    lines.push({
      local_id: `cp-${row.id}`,
      product_id: productId,
      case_product_id: row.id,
      product_name: product?.name || "名称未設定",
      model_no: product?.model_no || "",
      quantity: quantity == null ? "" : String(quantity),
      unit_price: snap.unitPrice,
      memo: row.memo || "",
      sort_order: lines.length,
      has_case_snapshot: snap.hasCaseSnapshot,
      source: "PRODUCT",
    });
  }

  for (const pkg of casePackages) {
    const items = Array.isArray(pkg.case_package_items)
      ? pkg.case_package_items
      : pkg.case_package_items
        ? [pkg.case_package_items]
        : [];

    const visible = items
      .filter(
        (item) =>
          item.is_selected !== false &&
          item.is_hidden !== true &&
          Boolean(item.product_id)
      )
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    for (const item of visible) {
      const product = getSingleRelation(item.products);
      // item.quantity は登録時に構成×パッケージで保存済み
      const quantity = resolvePackageItemOrderQuantity({
        storedItemQuantity: item.quantity,
        packageQuantity: pkg.quantity,
      });
      const snap = resolveItemSnapshotUnitPrice(
        item.unit_purchase_price,
        item.total_purchase_price,
        quantity
      );

      lines.push({
        local_id: `cpi-${item.id}`,
        product_id: item.product_id as string,
        case_product_id: null,
        product_name:
          item.display_name_snapshot ||
          item.product_name_snapshot ||
          product?.name ||
          "名称未設定",
        model_no: item.model_no_snapshot || product?.model_no || "",
        quantity: quantity == null ? "" : String(quantity),
        unit_price: snap.unitPrice,
        memo: item.memo || "",
        sort_order: lines.length,
        has_case_snapshot: snap.hasCaseSnapshot,
        source: "PACKAGE_ITEM",
      });
    }
  }

  return lines;
}

/**
 * スナップショットなし明細へマスタ単価を適用。
 * 見つからない場合は未設定（空）のまま手入力待ち。実値0はマスタに無い扱い。
 */
export function applyMasterUnitPrices(
  lines: OrderLineDraft[],
  unitPriceByProductId: Map<string, number>
): { lines: OrderLineDraft[]; missingProductNames: string[] } {
  const missingNames: string[] = [];

  const next = lines.map((line) => {
    if (line.has_case_snapshot) return line;
    const unit = unitPriceByProductId.get(line.product_id);
    if (unit != null && unit > 0) {
      return { ...line, unit_price: String(unit) };
    }
    missingNames.push(line.product_name || "名称未設定");
    return { ...line, unit_price: "" };
  });

  return {
    lines: next,
    missingProductNames: Array.from(new Set(missingNames)),
  };
}

export function clearNonSnapshotUnitPrices(
  lines: OrderLineDraft[]
): OrderLineDraft[] {
  return lines.map((line) =>
    line.has_case_snapshot ? line : { ...line, unit_price: "" }
  );
}
