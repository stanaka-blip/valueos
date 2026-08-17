/**
 * 管理者発注画面の対象モデル（PRODUCT行 / PACKAGE単位）と
 * 仕入先バケット分割・発注番号採番の純関数。
 *
 * PACKAGE: UI・金額はパッケージ仕入単価×数量が正。
 * 保存時は構成部材行（数量・unit_price=0）＋パッケージ金額行を order_items に書く。
 */

import {
  calcLineAmount,
  generateOrderNumber,
} from "@/app/orders/orderUtils";
import {
  buildPackageAmountMemo,
  buildPackageComponentMemo,
} from "@/lib/orders/orderPackageDisplay";
import {
  isProductCaseLine,
  isUnitPriceUnset,
  parseOrderQuantity,
  parseUnitPriceInput,
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
  /** 構成×パッケージの発注数量（納品用） */
  quantity: string;
  /** 構成1セットあたり数量（パッケージ数量変更時の再計算用） */
  unit_component_qty: number;
  memo: string;
};

export type PackageOrderTarget = {
  kind: "PACKAGE";
  local_id: string;
  case_package_id: string;
  case_product_id: string | null;
  package_id: string | null;
  package_name: string;
  /** パッケージ数量 */
  quantity: string;
  /** パッケージ仕入単価 */
  unit_price: string;
  has_case_snapshot: boolean;
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

export type CaseProductWithDefaultSupplier = Omit<
  CaseProductSource,
  "products"
> & {
  products: ProductMasterRelation | ProductMasterRelation[] | null;
};

export type CasePackageWithDefaultSupplier = CasePackageSource & {
  package_id?: string | null;
  case_product_id?: string | null;
  package_name_snapshot?: string | null;
  /** 紐づく case_products（PACKAGE）の仕入スナップショット */
  case_product_purchase_price?: number | string | null;
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

function resolveUnitComponentQty(
  storedItemQty: number | null,
  packageQty: number | null
): number {
  if (storedItemQty == null || packageQty == null || packageQty < 1) {
    return storedItemQty != null && storedItemQty >= 1 ? storedItemQty : 1;
  }
  if (storedItemQty % packageQty === 0) {
    const unit = storedItemQty / packageQty;
    return unit >= 1 ? unit : storedItemQty;
  }
  return storedItemQty;
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
    const packageQty = parseOrderQuantity(pkg.quantity);
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
        unit_component_qty: resolveUnitComponentQty(quantity, packageQty),
        memo: item.memo || "",
      };
    });

    if (items.length === 0) continue;

    const pkgSnap = resolveSnapshotUnitPrice(
      pkg.case_product_purchase_price,
      packageQty
    );

    targets.push({
      kind: "PACKAGE",
      local_id: `pkg-${pkg.id}`,
      case_package_id: pkg.id,
      case_product_id: pkg.case_product_id || null,
      package_id: pkg.package_id || null,
      package_name:
        pkg.package_name_snapshot || pkgMaster?.name || "パッケージ",
      quantity: packageQty == null ? "" : String(packageQty),
      unit_price: pkgSnap.unitPrice,
      has_case_snapshot: pkgSnap.hasCaseSnapshot,
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
  source: "PRODUCT" | "PACKAGE_ITEM" | "PACKAGE_AMOUNT";
  package_local_id?: string;
};

/**
 * PRODUCT はそのまま。
 * PACKAGE は構成行（unit_price=0）＋金額行（package_unit × package_qty）。
 */
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

    const packageQty = parseOrderQuantity(target.quantity);
    const packageUnit = parseUnitPriceInput(target.unit_price);
    const carrierProductId = target.items[0]?.product_id;
    if (!carrierProductId || packageQty == null || packageUnit == null) {
      // 検証前の途中状態でも構成行は出す
      for (const item of target.items) {
        lines.push({
          local_id: item.local_id,
          product_id: item.product_id,
          case_product_id: null,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: "0",
          memo: buildPackageComponentMemo(target.case_package_id),
          supplier_id: target.supplier_id,
          source: "PACKAGE_ITEM",
          package_local_id: target.local_id,
        });
      }
      continue;
    }

    lines.push({
      local_id: `${target.local_id}-amt`,
      product_id: carrierProductId,
      case_product_id: target.case_product_id,
      product_name: target.package_name,
      quantity: String(packageQty),
      unit_price: String(packageUnit),
      memo: buildPackageAmountMemo({
        casePackageId: target.case_package_id,
        packageName: target.package_name,
        packageQty,
      }),
      supplier_id: target.supplier_id,
      source: "PACKAGE_AMOUNT",
      package_local_id: target.local_id,
    });

    for (const item of target.items) {
      lines.push({
        local_id: item.local_id,
        product_id: item.product_id,
        case_product_id: null,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: "0",
        memo: buildPackageComponentMemo(target.case_package_id),
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

/** パッケージ仕入金額（単価×数量）。未設定時は null */
export function packageLineAmount(target: PackageOrderTarget): number | null {
  const qty = parseOrderQuantity(target.quantity);
  const unit = parseUnitPriceInput(target.unit_price);
  if (qty == null || unit == null || unit < 0) return null;
  return calcLineAmount(qty, unit);
}

export type SupplierBucket = {
  supplier_id: string;
  lines: FlattenedOrderLine[];
};

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

export function formatPurchaseOrderSheetLabel(indexOneBased: number): string {
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  if (indexOneBased >= 1 && indexOneBased <= 20) {
    return `発注書${circled[indexOneBased - 1]}`;
  }
  return `発注書${indexOneBased}`;
}

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
    if (parseOrderQuantity(target.quantity) == null) {
      return {
        ok: false,
        error_message: `「${target.package_name || "パッケージ"}」の数量は1以上の整数で入力してください。`,
      };
    }
    if (isUnitPriceUnset(target.unit_price)) {
      return {
        ok: false,
        error_message: `「${target.package_name || "パッケージ"}」の仕入単価が未設定です。単価を入力してください。`,
      };
    }
    const pkgUnit = parseUnitPriceInput(target.unit_price);
    if (pkgUnit == null || pkgUnit < 0) {
      return {
        ok: false,
        error_message: `「${target.package_name || "パッケージ"}」の仕入単価は0以上で入力してください。`,
      };
    }
    for (const item of target.items) {
      if (!item.product_id) {
        return { ok: false, error_message: "商品が紐づいていない明細があります。" };
      }
      if (parseOrderQuantity(item.quantity) == null) {
        return {
          ok: false,
          error_message: `「${item.product_name || "名称未設定"}」の構成数量は1以上の整数である必要があります。`,
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
 * スナップショットなし明細へマスタ単価を適用。
 * PRODUCT: supplier×product
 * PACKAGE: supplier×package（unitPriceBySupplierPackage）
 */
export function applySupplierMasterUnitPrices(
  targets: OrderTarget[],
  unitPriceBySupplierProduct: Map<string, Map<string, number>>,
  unitPriceBySupplierPackage?: Map<string, Map<string, number>>
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

    if (target.has_case_snapshot) return target;
    const packageId = target.package_id;
    if (!packageId) {
      missingNames.push(target.package_name || "パッケージ");
      return { ...target, unit_price: "" };
    }
    const byPackage = unitPriceBySupplierPackage?.get(target.supplier_id);
    const unit = byPackage?.get(packageId);
    if (unit != null && unit > 0) {
      return { ...target, unit_price: String(unit) };
    }
    missingNames.push(target.package_name || "パッケージ");
    return { ...target, unit_price: "" };
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
      return target.has_case_snapshot ? target : { ...target, unit_price: "" };
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
      return target.has_case_snapshot ? target : { ...target, unit_price: "" };
    }

    return target;
  });
}

/** パッケージ数量変更時に構成数量を unit_component_qty × 新数量へ更新 */
export function scalePackageItemQuantities(
  target: PackageOrderTarget,
  newPackageQty: string
): PackageOrderTarget {
  const qty = parseOrderQuantity(newPackageQty);
  if (qty == null) {
    return { ...target, quantity: newPackageQty };
  }
  return {
    ...target,
    quantity: String(qty),
    items: target.items.map((item) => ({
      ...item,
      quantity: String(Math.max(1, item.unit_component_qty * qty)),
    })),
  };
}
