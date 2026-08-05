/**
 * 管理者発注画面の対象モデル（PRODUCT行 / PACKAGE単位）と
 * 仕入先バケット分割・発注番号採番の純関数。
 */

import {
  calcLineAmount,
  generateOrderNumber,
} from "@/app/orders/orderUtils";
import {
  isProductCaseLine,
  isUnitPriceUnset,
  parseOrderQuantity,
  parseUnitPriceInput,
  resolveItemSnapshotUnitPrice,
  resolvePackageItemOrderQuantity,
  resolveSnapshotUnitPrice,
  type CasePackageItemSource,
  type CasePackageSource,
  type CaseProductSource,
} from "@/app/cases/[id]/buildOrderLines";

export type ProductOrderTarget = {
  kind: "PRODUCT";
  local_id: string;
  case_product_id: string;
  product_id: string;
  product_name: string;
  manufacturer_name: string;
  model_no: string;
  quantity: string;
  unit_price: string;
  memo: string;
  has_case_snapshot: boolean;
  supplier_id: string;
  default_supplier_id: string | null;
};

export type PackageItemOrderTarget = {
  local_id: string;
  product_id: string;
  product_name: string;
  manufacturer_name: string;
  model_no: string;
  quantity: string;
  unit_price: string;
  memo: string;
  has_case_snapshot: boolean;
};

export type PackageOrderTarget = {
  kind: "PACKAGE";
  local_id: string;
  case_package_id: string;
  package_id: string | null;
  package_name: string;
  supplier_id: string;
  default_supplier_id: string | null;
  items: PackageItemOrderTarget[];
};

export type OrderTarget = ProductOrderTarget | PackageOrderTarget;

type ProductMasterRelation = {
  name: string | null;
  model_no: string | null;
  default_supplier_id?: string | null;
  manufacturers?:
    | { name: string | null }
    | { name: string | null }[]
    | null;
};

export type CaseProductWithDefaultSupplier = Omit<CaseProductSource, "products"> & {
  products: ProductMasterRelation | ProductMasterRelation[] | null;
};

export type CasePackageWithDefaultSupplier = CasePackageSource & {
  package_id?: string | null;
  package_name_snapshot?: string | null;
  packages?:
    | {
        name: string | null;
        default_supplier_id?: string | null;
      }
    | {
        name: string | null;
        default_supplier_id?: string | null;
      }[]
    | null;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

export function buildOrderTargets(
  caseProducts: CaseProductWithDefaultSupplier[],
  casePackages: CasePackageWithDefaultSupplier[]
): OrderTarget[] {
  const targets: OrderTarget[] = [];

  for (const row of caseProducts) {
    if (!isProductCaseLine(row)) continue;
    const productId = row.product_id as string;
    const product = getSingleRelation(row.products);
    const quantity = parseOrderQuantity(row.quantity);
    const snap = resolveSnapshotUnitPrice(row.purchase_price, quantity);
    const defaultSupplierId = product?.default_supplier_id || null;

    targets.push({
      kind: "PRODUCT",
      local_id: `cp-${row.id}`,
      case_product_id: row.id,
      product_id: productId,
      product_name: product?.name || "名称未設定",
      manufacturer_name:
        getSingleRelation(product?.manufacturers)?.name?.trim() || "",
      model_no: product?.model_no || "",
      quantity: quantity == null ? "" : String(quantity),
      unit_price: snap.unitPrice,
      memo: row.memo || "",
      has_case_snapshot: snap.hasCaseSnapshot,
      supplier_id: defaultSupplierId || "",
      default_supplier_id: defaultSupplierId,
    });
  }

  for (const pkg of casePackages) {
    const pkgMaster = getSingleRelation(pkg.packages);
    const defaultSupplierId = pkgMaster?.default_supplier_id || null;
    const itemsSrc = Array.isArray(pkg.case_package_items)
      ? pkg.case_package_items
      : pkg.case_package_items
        ? [pkg.case_package_items]
        : [];

    const visible = (itemsSrc as CasePackageItemSource[])
      .filter(
        (item) =>
          item.is_selected !== false &&
          item.is_hidden !== true &&
          Boolean(item.product_id)
      )
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const items: PackageItemOrderTarget[] = visible.map((item) => {
      const product = getSingleRelation(item.products);
      const quantity = resolvePackageItemOrderQuantity({
        storedItemQuantity: item.quantity,
        packageQuantity: pkg.quantity,
      });
      const snap = resolveItemSnapshotUnitPrice(
        item.unit_purchase_price,
        item.total_purchase_price,
        quantity
      );
      return {
        local_id: `cpi-${item.id}`,
        product_id: item.product_id as string,
        product_name:
          item.display_name_snapshot ||
          item.product_name_snapshot ||
          product?.name ||
          "名称未設定",
        manufacturer_name:
          getSingleRelation(product?.manufacturers)?.name?.trim() || "",
        model_no: item.model_no_snapshot || product?.model_no || "",
        quantity: quantity == null ? "" : String(quantity),
        unit_price: snap.unitPrice,
        memo: item.memo || "",
        has_case_snapshot: snap.hasCaseSnapshot,
      };
    });

    if (items.length === 0) continue;

    targets.push({
      kind: "PACKAGE",
      local_id: `pkg-${pkg.id}`,
      case_package_id: pkg.id,
      package_id: pkg.package_id || null,
      package_name:
        pkg.package_name_snapshot || pkgMaster?.name || "パッケージ",
      supplier_id: defaultSupplierId || "",
      default_supplier_id: defaultSupplierId,
      items,
    });
  }

  return targets;
}

/** 発注明細として展開したフラット行（保存・金額集計用） */
export type FlattenedOrderLine = {
  local_id: string;
  product_id: string;
  case_product_id: string | null;
  product_name: string;
  quantity: string;
  unit_price: string;
  memo: string;
  supplier_id: string;
  source: "PRODUCT" | "PACKAGE_ITEM";
  package_local_id?: string;
};

export function flattenOrderTargets(targets: OrderTarget[]): FlattenedOrderLine[] {
  const lines: FlattenedOrderLine[] = [];
  for (const target of targets) {
    if (target.kind === "PRODUCT") {
      lines.push({
        local_id: target.local_id,
        product_id: target.product_id,
        case_product_id: target.case_product_id,
        product_name: target.product_name,
        quantity: target.quantity,
        unit_price: target.unit_price,
        memo: target.memo,
        supplier_id: target.supplier_id,
        source: "PRODUCT",
      });
      continue;
    }
    for (const item of target.items) {
      lines.push({
        local_id: item.local_id,
        product_id: item.product_id,
        case_product_id: null,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        memo: item.memo,
        supplier_id: target.supplier_id,
        source: "PACKAGE_ITEM",
        package_local_id: target.local_id,
      });
    }
  }
  return lines;
}

export function sumOrderAmount(lines: FlattenedOrderLine[]): number {
  return lines.reduce((sum, line) => {
    const qty = parseOrderQuantity(line.quantity) ?? 0;
    const unit = parseUnitPriceInput(line.unit_price);
    if (unit == null || unit < 0) return sum;
    return sum + calcLineAmount(qty, unit);
  }, 0);
}

export type SupplierBucket = {
  supplier_id: string;
  lines: FlattenedOrderLine[];
};

/** 仕入先ごとに明細をグループ化。supplier_id 空は別バケットにしない（呼び出し側で検証） */
export function groupLinesBySupplier(
  lines: FlattenedOrderLine[]
): SupplierBucket[] {
  const map = new Map<string, FlattenedOrderLine[]>();
  for (const line of lines) {
    const key = line.supplier_id.trim();
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(line);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([supplier_id, bucketLines]) => ({
    supplier_id,
    lines: bucketLines,
  }));
}

/** UI表示用: OrderTarget を仕入先単位でグループ化（PACKAGE構造を維持）。空仕入先は含めない */
export type SupplierTargetGroup = {
  supplier_id: string;
  targets: OrderTarget[];
};

export function groupOrderTargetsBySupplier(
  targets: OrderTarget[]
): SupplierTargetGroup[] {
  const map = new Map<string, OrderTarget[]>();
  for (const target of targets) {
    const key = target.supplier_id.trim();
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(target);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([supplier_id, groupTargets]) => ({
    supplier_id,
    targets: groupTargets,
  }));
}

/** 発注書①…⑳（21件目以降は数字） */
export function formatPurchaseOrderSheetLabel(indexOneBased: number): string {
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  if (indexOneBased >= 1 && indexOneBased <= 20) {
    return `発注書${circled[indexOneBased - 1]}`;
  }
  return `発注書${indexOneBased}`;
}

/** 同一秒でも衝突しにくいよう、2件目以降に連番サフィックスを付与 */
export function generateUniqueOrderNumbers(
  caseNo: string | null,
  count: number
): string[] {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) return [];
  const base = generateOrderNumber(caseNo);
  if (safeCount === 1) return [base];
  return Array.from({ length: safeCount }, (_, index) =>
    index === 0 ? base : `${base}-${String(index + 1).padStart(2, "0")}`
  );
}

export type OrderTargetValidation =
  | { ok: true }
  | { ok: false; error_message: string };

export function validateOrderTargetsForSave(
  targets: OrderTarget[]
): OrderTargetValidation {
  if (targets.length === 0) {
    return {
      ok: false,
      error_message: "発注明細がありません。案件に商品を追加してください。",
    };
  }

  for (const target of targets) {
    if (!target.supplier_id.trim()) {
      const label =
        target.kind === "PRODUCT"
          ? target.product_name || "名称未設定"
          : target.package_name || "パッケージ";
      return {
        ok: false,
        error_message: `「${label}」の仕入先を選択してください。`,
      };
    }

    if (target.kind === "PRODUCT") {
      if (!target.product_id) {
        return { ok: false, error_message: "商品が紐づいていない明細があります。" };
      }
      if (parseOrderQuantity(target.quantity) == null) {
        return {
          ok: false,
          error_message: `「${target.product_name || "名称未設定"}」の数量は1以上の整数で入力してください。`,
        };
      }
      if (isUnitPriceUnset(target.unit_price)) {
        return {
          ok: false,
          error_message: `「${target.product_name || "名称未設定"}」の仕入単価が未設定です。単価を入力してください。`,
        };
      }
      const unit = parseUnitPriceInput(target.unit_price);
      if (unit == null || unit < 0) {
        return {
          ok: false,
          error_message: `「${target.product_name || "名称未設定"}」の仕入単価は0以上で入力してください。`,
        };
      }
      continue;
    }

    if (target.items.length === 0) {
      return {
        ok: false,
        error_message: `「${target.package_name || "パッケージ"}」の構成商品がありません。`,
      };
    }
    for (const item of target.items) {
      if (!item.product_id) {
        return { ok: false, error_message: "商品が紐づいていない明細があります。" };
      }
      if (parseOrderQuantity(item.quantity) == null) {
        return {
          ok: false,
          error_message: `「${item.product_name || "名称未設定"}」の数量は1以上の整数で入力してください。`,
        };
      }
      if (isUnitPriceUnset(item.unit_price)) {
        return {
          ok: false,
          error_message: `「${item.product_name || "名称未設定"}」の仕入単価が未設定です。単価を入力してください。`,
        };
      }
      const unit = parseUnitPriceInput(item.unit_price);
      if (unit == null || unit < 0) {
        return {
          ok: false,
          error_message: `「${item.product_name || "名称未設定"}」の仕入単価は0以上で入力してください。`,
        };
      }
    }
  }

  const lines = flattenOrderTargets(targets);
  if (sumOrderAmount(lines) <= 0) {
    return {
      ok: false,
      error_message: "発注金額は1円以上になるよう明細を入力してください。",
    };
  }

  return { ok: true };
}

/**
 * スナップショットなし明細へ、仕入先別マスタ単価を適用。
 * unitPriceBySupplierProduct: supplier_id → (product_id → unit)
 */
export function applySupplierMasterUnitPrices(
  targets: OrderTarget[],
  unitPriceBySupplierProduct: Map<string, Map<string, number>>
): { targets: OrderTarget[]; missingProductNames: string[] } {
  const missingNames: string[] = [];

  const next = targets.map((target) => {
    if (target.kind === "PRODUCT") {
      if (target.has_case_snapshot) return target;
      const byProduct = unitPriceBySupplierProduct.get(target.supplier_id);
      const unit = byProduct?.get(target.product_id);
      if (unit != null && unit > 0) {
        return { ...target, unit_price: String(unit) };
      }
      missingNames.push(target.product_name || "名称未設定");
      return { ...target, unit_price: "" };
    }

    const byProduct = unitPriceBySupplierProduct.get(target.supplier_id);
    const items = target.items.map((item) => {
      if (item.has_case_snapshot) return item;
      const unit = byProduct?.get(item.product_id);
      if (unit != null && unit > 0) {
        return { ...item, unit_price: String(unit) };
      }
      missingNames.push(item.product_name || "名称未設定");
      return { ...item, unit_price: "" };
    });
    return { ...target, items };
  });

  return {
    targets: next,
    missingProductNames: Array.from(new Set(missingNames)),
  };
}

export function clearNonSnapshotPricesForSupplierChange(
  targets: OrderTarget[],
  options: {
    productLocalId?: string;
    packageLocalId?: string;
    clearAllNonSnapshot?: boolean;
  }
): OrderTarget[] {
  return targets.map((target) => {
    if (options.clearAllNonSnapshot) {
      if (target.kind === "PRODUCT") {
        return target.has_case_snapshot ? target : { ...target, unit_price: "" };
      }
      return {
        ...target,
        items: target.items.map((item) =>
          item.has_case_snapshot ? item : { ...item, unit_price: "" }
        ),
      };
    }

    if (
      options.productLocalId &&
      target.kind === "PRODUCT" &&
      target.local_id === options.productLocalId
    ) {
      return target.has_case_snapshot ? target : { ...target, unit_price: "" };
    }

    if (
      options.packageLocalId &&
      target.kind === "PACKAGE" &&
      target.local_id === options.packageLocalId
    ) {
      return {
        ...target,
        items: target.items.map((item) =>
          item.has_case_snapshot ? item : { ...item, unit_price: "" }
        ),
      };
    }

    return target;
  });
}
