/**
 * 案件詳細・商品カード向けの仕入先/価格 enrichment（表示専用）。
 * 価格解決は lib/purchasePrices（PR #144）と
 * applySupplierMasterUnitPrices を再利用する。
 * DB への書き戻しはしない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applySupplierMasterUnitPrices,
  type OrderTarget,
} from "@/app/cases/[id]/orders/orderTargets";
import {
  fetchActivePackagePurchaseUnitPrices,
  fetchActivePurchaseUnitPrices,
  getTodayDateString,
} from "@/lib/purchasePrices";
import {
  fetchActiveSalesPrice,
  fetchActiveSalesUnitPrices,
} from "@/lib/salesPrices";
import { isActiveOrderStatus } from "@/lib/status/activeRecords";

import {
  parseCaseProductQuantity,
  resolveCaseProductCardPricing,
} from "./caseProductCardPricing";
import type { CaseProductDisplayRow } from "./productDisplay";

export type CaseProductCardSourceRow = {
  id: string;
  line_type: string | null;
  product_id: string | null;
  package_id: string | null;
  quantity: number | string | null;
  purchase_price: number | string | null;
  sales_price: number | string | null;
  gross_profit: number | string | null;
  supplier_id: string | null;
  supplierName: string;
  default_supplier_id: string | null;
  defaultSupplierName: string;
};

export type OrderedPurchaseAggregate = {
  amount: number;
  supplierId: string | null;
  supplierName: string;
  /** 有効発注に登場した仕入先数（取消除外・null 仕入先は数えない） */
  supplierCount: number;
};

function toNullableAmount(
  value: number | string | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMultiSupplierLabel(supplierCount: number): string {
  return `複数仕入先（${supplierCount}社）`;
}

/**
 * 有効発注の order_items から case_product_id ごとの仕入金額を集計。
 * 取消/キャンセル発注は金額・仕入先の両方から除外。
 * case_product_id が null の行（PACKAGE COMP / CUSTOM 等）は集計しない。
 */
export function aggregateOrderedPurchaseByCaseProduct(args: {
  orders: Array<{
    id: string;
    status: string;
    supplierId: string | null;
    supplierName: string;
  }>;
  orderItems: Array<{
    order_id: string;
    case_product_id: string | null;
    amount: number | string | null;
  }>;
}): Map<string, OrderedPurchaseAggregate> {
  const activeOrders = new Map(
    args.orders
      .filter((order) => isActiveOrderStatus(order.status))
      .map((order) => [order.id, order] as const)
  );

  type Accumulator = {
    amount: number;
    supplierIds: Set<string>;
    supplierNameById: Map<string, string>;
    firstSupplierId: string | null;
    firstSupplierName: string;
  };

  const totals = new Map<string, Accumulator>();

  for (const item of args.orderItems) {
    const caseProductId = item.case_product_id;
    if (!caseProductId) continue;
    const order = activeOrders.get(item.order_id);
    if (!order) continue;
    const amount = toNullableAmount(item.amount);
    if (amount == null) continue;

    const current = totals.get(caseProductId);
    if (!current) {
      const supplierIds = new Set<string>();
      const supplierNameById = new Map<string, string>();
      if (order.supplierId) {
        supplierIds.add(order.supplierId);
        supplierNameById.set(
          order.supplierId,
          (order.supplierName || "").trim()
        );
      }
      totals.set(caseProductId, {
        amount,
        supplierIds,
        supplierNameById,
        firstSupplierId: order.supplierId,
        firstSupplierName: (order.supplierName || "").trim(),
      });
    } else {
      current.amount += amount;
      if (order.supplierId) {
        current.supplierIds.add(order.supplierId);
        if (!current.supplierNameById.has(order.supplierId)) {
          current.supplierNameById.set(
            order.supplierId,
            (order.supplierName || "").trim()
          );
        }
      }
    }
  }

  const result = new Map<string, OrderedPurchaseAggregate>();
  for (const [caseProductId, acc] of totals) {
    const supplierCount = acc.supplierIds.size;
    if (supplierCount > 1) {
      result.set(caseProductId, {
        amount: acc.amount,
        supplierId: null,
        supplierName: formatMultiSupplierLabel(supplierCount),
        supplierCount,
      });
    } else if (supplierCount === 1) {
      const supplierId = Array.from(acc.supplierIds)[0]!;
      result.set(caseProductId, {
        amount: acc.amount,
        supplierId,
        supplierName:
          acc.supplierNameById.get(supplierId) || acc.firstSupplierName,
        supplierCount: 1,
      });
    } else {
      result.set(caseProductId, {
        amount: acc.amount,
        supplierId: acc.firstSupplierId,
        supplierName: acc.firstSupplierName,
        supplierCount: 0,
      });
    }
  }

  return result;
}

async function loadPackageComponents(
  client: SupabaseClient,
  packageIds: string[]
): Promise<Map<string, Array<{ productId: string; unitComponentQty: number }>>> {
  const unique = Array.from(new Set(packageIds.filter(Boolean)));
  const result = new Map<
    string,
    Array<{ productId: string; unitComponentQty: number }>
  >();
  if (unique.length === 0) return result;

  const { data, error } = await client
    .from("package_items")
    .select("package_id, product_id, quantity")
    .in("package_id", unique);

  if (error) {
    console.error("[enrichCaseProductCardPricing] package_items:", error.message);
    return result;
  }

  for (const row of data || []) {
    const packageId = row.package_id as string | null;
    const productId = row.product_id as string | null;
    const qty = Number(row.quantity);
    if (!packageId || !productId || !Number.isFinite(qty) || qty <= 0) continue;
    const list = result.get(packageId) || [];
    list.push({ productId, unitComponentQty: qty });
    result.set(packageId, list);
  }
  return result;
}

async function loadSupplierNames(
  client: SupabaseClient,
  supplierIds: string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(supplierIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await client
    .from("suppliers")
    .select("id, name")
    .in("id", unique);

  if (error) {
    console.error("[enrichCaseProductCardPricing] suppliers:", error.message);
    return map;
  }

  for (const row of data || []) {
    map.set(row.id as string, ((row.name as string) || "").trim());
  }
  return map;
}

/**
 * スナップショット/発注金額が無い明細だけ、PR #144 resolver でマスタ単価を解決する。
 */
export async function enrichCaseProductDisplayRows(args: {
  client: SupabaseClient;
  dealerId: string | null;
  asOfDate?: string | null;
  sourceRows: CaseProductCardSourceRow[];
  displayRows: CaseProductDisplayRow[];
  orderedPurchaseByCaseProductId: Map<string, OrderedPurchaseAggregate>;
}): Promise<CaseProductDisplayRow[]> {
  const asOfDate = args.asOfDate || getTodayDateString();
  const byId = new Map(args.sourceRows.map((row) => [row.id, row]));

  const needsMasterPurchase: CaseProductCardSourceRow[] = [];
  const needsMasterSales: CaseProductCardSourceRow[] = [];

  for (const row of args.sourceRows) {
    const hasPurchaseSnapshot = toNullableAmount(row.purchase_price) != null;
    const hasOrderPurchase = args.orderedPurchaseByCaseProductId.has(row.id);
    if (!hasPurchaseSnapshot && !hasOrderPurchase) {
      needsMasterPurchase.push(row);
    }
    if (toNullableAmount(row.sales_price) == null) {
      needsMasterSales.push(row);
    }
  }

  const supplierIdsForNames = new Set<string>();
  for (const row of args.sourceRows) {
    if (row.supplier_id) supplierIdsForNames.add(row.supplier_id);
    if (row.default_supplier_id) {
      supplierIdsForNames.add(row.default_supplier_id);
    }
  }
  for (const ordered of args.orderedPurchaseByCaseProductId.values()) {
    if (ordered.supplierId) supplierIdsForNames.add(ordered.supplierId);
  }

  const supplierNameById = await loadSupplierNames(
    args.client,
    Array.from(supplierIdsForNames)
  );

  const packageIdsNeedingFallback = needsMasterPurchase
    .filter((row) => String(row.line_type || "").toUpperCase() === "PACKAGE")
    .map((row) => row.package_id)
    .filter((id): id is string => Boolean(id));

  const packageComponents = await loadPackageComponents(
    args.client,
    packageIdsNeedingFallback
  );

  const productIdsBySupplier = new Map<string, string[]>();
  const packageIdsBySupplier = new Map<string, string[]>();

  const resolvedSupplierIdFor = (
    row: CaseProductCardSourceRow
  ): string | null => {
    if (row.supplier_id) return row.supplier_id;
    const ordered = args.orderedPurchaseByCaseProductId.get(row.id);
    if (ordered?.supplierId) return ordered.supplierId;
    return row.default_supplier_id;
  };

  for (const row of needsMasterPurchase) {
    const supplierId = resolvedSupplierIdFor(row);
    if (!supplierId) continue;
    const lineType = String(row.line_type || "").toUpperCase();
    if (lineType === "PACKAGE" && row.package_id) {
      const pkgs = packageIdsBySupplier.get(supplierId) || [];
      pkgs.push(row.package_id);
      packageIdsBySupplier.set(supplierId, pkgs);
      const components = packageComponents.get(row.package_id) || [];
      if (components.length > 0) {
        const products = productIdsBySupplier.get(supplierId) || [];
        for (const c of components) products.push(c.productId);
        productIdsBySupplier.set(supplierId, products);
      }
    } else if (row.product_id) {
      const products = productIdsBySupplier.get(supplierId) || [];
      products.push(row.product_id);
      productIdsBySupplier.set(supplierId, products);
    }
  }

  const unitPriceBySupplierProduct = new Map<string, Map<string, number>>();
  const unitPriceBySupplierPackage = new Map<string, Map<string, number>>();
  const supplierIds = new Set([
    ...productIdsBySupplier.keys(),
    ...packageIdsBySupplier.keys(),
  ]);

  await Promise.all(
    Array.from(supplierIds).map(async (supplierId) => {
      const productIds = Array.from(
        new Set(productIdsBySupplier.get(supplierId) || [])
      );
      const packageIds = Array.from(
        new Set(packageIdsBySupplier.get(supplierId) || [])
      );

      if (productIds.length > 0) {
        const result = await fetchActivePurchaseUnitPrices(args.client, {
          productIds,
          supplierId,
          asOfDate,
        });
        if (result.error) {
          console.error(
            "[enrichCaseProductCardPricing] purchase product:",
            result.error
          );
        }
        unitPriceBySupplierProduct.set(supplierId, result.unitPriceByProductId);
      } else {
        unitPriceBySupplierProduct.set(supplierId, new Map());
      }

      if (packageIds.length > 0) {
        const result = await fetchActivePackagePurchaseUnitPrices(args.client, {
          packageIds,
          supplierId,
          asOfDate,
        });
        if (result.error) {
          console.error(
            "[enrichCaseProductCardPricing] purchase package:",
            result.error
          );
        }
        unitPriceBySupplierPackage.set(supplierId, result.unitPriceByPackageId);
      } else {
        unitPriceBySupplierPackage.set(supplierId, new Map());
      }
    })
  );

  const masterTargets: OrderTarget[] = needsMasterPurchase.map((row) => {
    const supplierId = resolvedSupplierIdFor(row) || "";
    const lineType = String(row.line_type || "").toUpperCase();
    const qty = parseCaseProductQuantity(row.quantity);
    if (lineType === "PACKAGE") {
      const components = row.package_id
        ? packageComponents.get(row.package_id) || []
        : [];
      return {
        kind: "PACKAGE" as const,
        local_id: row.id,
        case_package_id: row.id,
        case_product_id: row.id,
        package_id: row.package_id,
        package_name: row.package_id || "パッケージ",
        quantity: qty != null ? String(qty) : "",
        unit_price: "",
        has_case_snapshot: false,
        supplier_id: supplierId,
        default_supplier_id: row.default_supplier_id,
        items: components.map((c, index) => ({
          local_id: `${row.id}-${index}`,
          product_id: c.productId,
          product_name: c.productId,
          manufacturer_name: "",
          model_no: "",
          quantity: String(c.unitComponentQty),
          unit_component_qty: c.unitComponentQty,
          memo: "",
        })),
      };
    }
    return {
      kind: "PRODUCT" as const,
      local_id: row.id,
      case_product_id: row.id,
      product_id: row.product_id || "",
      product_name: row.product_id || "商品",
      manufacturer_name: "",
      model_no: "",
      quantity: qty != null ? String(qty) : "",
      unit_price: "",
      memo: "",
      has_case_snapshot: false,
      supplier_id: supplierId,
      default_supplier_id: row.default_supplier_id,
    };
  });

  const priced = applySupplierMasterUnitPrices(
    masterTargets,
    unitPriceBySupplierProduct,
    unitPriceBySupplierPackage
  );

  const masterPurchaseUnitByCaseProductId = new Map<string, number>();
  for (const target of priced.targets) {
    if (!target.unit_price || target.unit_price.trim() === "") continue;
    const unit = Number(target.unit_price);
    if (!Number.isFinite(unit) || unit < 0) continue;
    const caseProductId =
      target.kind === "PRODUCT"
        ? target.case_product_id
        : target.case_product_id || target.local_id;
    if (caseProductId) {
      masterPurchaseUnitByCaseProductId.set(caseProductId, unit);
    }
  }

  const masterSalesUnitByCaseProductId = new Map<string, number>();
  if (args.dealerId && needsMasterSales.length > 0) {
    const productIds = needsMasterSales
      .filter((row) => String(row.line_type || "").toUpperCase() !== "PACKAGE")
      .map((row) => row.product_id)
      .filter((id): id is string => Boolean(id));

    if (productIds.length > 0) {
      const salesBatch = await fetchActiveSalesUnitPrices(args.client, {
        productIds,
        dealerId: args.dealerId,
        asOfDate,
      });
      if (salesBatch.error) {
        console.error(
          "[enrichCaseProductCardPricing] sales product:",
          salesBatch.error
        );
      }
      for (const row of needsMasterSales) {
        if (!row.product_id) continue;
        if (String(row.line_type || "").toUpperCase() === "PACKAGE") continue;
        const unit = salesBatch.unitPriceByProductId.get(row.product_id);
        if (unit != null) {
          masterSalesUnitByCaseProductId.set(row.id, unit);
        }
      }
    }

    const packageRows = needsMasterSales.filter(
      (row) =>
        String(row.line_type || "").toUpperCase() === "PACKAGE" &&
        Boolean(row.package_id)
    );
    await Promise.all(
      packageRows.map(async (row) => {
        const result = await fetchActiveSalesPrice(args.client, {
          targetType: "PACKAGE",
          packageId: row.package_id,
          dealerId: args.dealerId as string,
          asOfDate,
        });
        if (result.error) {
          console.error(
            "[enrichCaseProductCardPricing] sales package:",
            result.error
          );
        }
        if (result.found) {
          masterSalesUnitByCaseProductId.set(row.id, result.unitPrice);
        }
      })
    );
  }

  return args.displayRows.map((display) => {
    const source = byId.get(display.id);
    if (!source) return display;

    const ordered = args.orderedPurchaseByCaseProductId.get(display.id);
    const caseSupplierId = source.supplier_id;
    const defaultSupplierId = source.default_supplier_id;

    const resolved = resolveCaseProductCardPricing({
      quantity: parseCaseProductQuantity(source.quantity),
      caseSupplierId,
      caseSupplierName:
        source.supplierName ||
        (caseSupplierId ? supplierNameById.get(caseSupplierId) || "" : ""),
      casePurchasePrice: toNullableAmount(source.purchase_price),
      caseSalesPrice: toNullableAmount(source.sales_price),
      caseGrossProfit: toNullableAmount(source.gross_profit),
      defaultSupplierId,
      defaultSupplierName:
        source.defaultSupplierName ||
        (defaultSupplierId
          ? supplierNameById.get(defaultSupplierId) || ""
          : ""),
      orderedPurchaseAmount: ordered ? ordered.amount : null,
      orderedSupplierId: ordered?.supplierId || null,
      orderedSupplierName:
        ordered?.supplierName ||
        (ordered?.supplierId
          ? supplierNameById.get(ordered.supplierId) || ""
          : ""),
      masterPurchaseUnitPrice:
        masterPurchaseUnitByCaseProductId.get(display.id) ?? null,
      masterSalesUnitPrice:
        masterSalesUnitByCaseProductId.get(display.id) ?? null,
    });

    return {
      ...display,
      supplierName: resolved.supplierName || display.supplierName,
      purchasePrice: resolved.purchasePrice,
      salesPrice: resolved.salesPrice,
      grossProfit: resolved.grossProfit,
      purchaseSource: resolved.purchaseSource,
      salesSource: resolved.salesSource,
    };
  });
}
