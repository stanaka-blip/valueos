import {
  displayCustomOrderLineUserMemo,
  isCustomOrderLine,
  parseCustomOrderItemMemo,
} from "@/lib/orders/orderCustomLine";

/**
 * 発注保存時のパッケージ金額行 / 構成行を memo で識別し、
 * 詳細・PDF・納品ではパッケージ1行＋構成内訳（金額なし）として再構成する。
 *
 * Migration なし: order_items は従来どおり product 行。
 * 金額の正は packages の仕入単価×数量を載せた PKG_AMT 行。
 */

export const VE_PKG_AMT_PREFIX = "[VE_PKG_AMT]";
export const VE_PKG_COMP_PREFIX = "[VE_PKG_COMP]";

/** case_packages.id 想定の UUID（誤判定防止） */
const CASE_PACKAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCasePackageId(value: string): boolean {
  return CASE_PACKAGE_ID_RE.test(value);
}

export function buildPackageAmountMemo(input: {
  casePackageId: string;
  packageName: string;
  packageQty: number;
}): string {
  const name = (input.packageName || "パッケージ").replace(/\|/g, "／");
  return `${VE_PKG_AMT_PREFIX}|${input.casePackageId}|${name}|${input.packageQty}`;
}

export function buildPackageComponentMemo(casePackageId: string): string {
  return `${VE_PKG_COMP_PREFIX}|${casePackageId}`;
}

/** 内部識別子で始まるか（パース成否に関わらず UI 露出防止用） */
export function containsPackageMemoMarker(
  memo: string | null | undefined
): boolean {
  const raw = (memo || "").trim();
  return (
    raw.startsWith(VE_PKG_AMT_PREFIX) || raw.startsWith(VE_PKG_COMP_PREFIX)
  );
}

export type OrderPackageLineKind =
  | "PRODUCT"
  | "PACKAGE_AMOUNT"
  | "PACKAGE_COMPONENT";

/** AMT/COMP は prefix で判定（不完全マーカーも保護対象） */
export function resolveOrderPackageLineKind(
  memo: string | null | undefined
): OrderPackageLineKind {
  const raw = (memo || "").trim();
  if (raw.startsWith(VE_PKG_AMT_PREFIX)) return "PACKAGE_AMOUNT";
  if (raw.startsWith(VE_PKG_COMP_PREFIX)) return "PACKAGE_COMPONENT";
  return "PRODUCT";
}

export function isProtectedPackageOrderLine(
  memo: string | null | undefined
): boolean {
  return resolveOrderPackageLineKind(memo) !== "PRODUCT";
}

export function canDeleteOrderEditLine(
  memo: string | null | undefined
): boolean {
  return !isProtectedPackageOrderLine(memo);
}

export function canEditOrderLineUnitPrice(
  memo: string | null | undefined
): boolean {
  return resolveOrderPackageLineKind(memo) !== "PACKAGE_COMPONENT";
}

/** ユーザー向け備考。内部マーカーは空文字（帳票・詳細に出さない） */
export function displaySafeOrderItemMemo(
  memo: string | null | undefined
): string {
  if (containsPackageMemoMarker(memo)) return "";
  if (isCustomOrderLine(memo)) return displayCustomOrderLineUserMemo(memo);
  return (memo || "").trim();
}

export function parsePackageAmountMemo(memo: string | null | undefined): {
  casePackageId: string;
  packageName: string;
  packageQty: number;
} | null {
  const raw = (memo || "").trim();
  if (!raw.startsWith(VE_PKG_AMT_PREFIX + "|")) return null;
  const parts = raw.split("|");
  if (parts.length < 4) return null;
  const casePackageId = parts[1]?.trim() || "";
  const packageName = parts[2]?.trim() || "パッケージ";
  const packageQty = Number(parts[3]);
  if (
    !isCasePackageId(casePackageId) ||
    !Number.isInteger(packageQty) ||
    packageQty < 1
  ) {
    return null;
  }
  return { casePackageId, packageName, packageQty };
}

export function parsePackageComponentMemo(
  memo: string | null | undefined
): { casePackageId: string } | null {
  const raw = (memo || "").trim();
  if (!raw.startsWith(VE_PKG_COMP_PREFIX + "|")) return null;
  const casePackageId = raw.slice((VE_PKG_COMP_PREFIX + "|").length).trim();
  if (!isCasePackageId(casePackageId)) return null;
  return { casePackageId };
}

export type OrderItemDisplaySource = {
  id: string;
  product_id: string | null;
  case_product_id: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number | null;
  memo: string | null;
  sort_order: number;
  manufacturer_name?: string;
  model_no?: string;
  product_name?: string;
};

export type OrderDisplayProductLine = {
  kind: "PRODUCT";
  key: string;
  product_name: string;
  manufacturer_name: string;
  model_no: string;
  quantity: number;
  unit_price: number;
  amount: number;
  memo: string;
};

export type OrderDisplayPackageLine = {
  kind: "PACKAGE";
  key: string;
  package_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  components: Array<{
    key: string;
    product_name: string;
    manufacturer_name: string;
    model_no: string;
    quantity: number;
    memo: string;
  }>;
};

export type OrderDisplayLine =
  | OrderDisplayProductLine
  | OrderDisplayPackageLine;

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * order_items を画面用に再構成。
 * PKG_AMT 行の金額をパッケージ行とし、同 case_package_id の COMP 行は金額なし内訳。
 * レガシー（マーカーなし）は従来どおり商品行として表示。
 */
export function buildOrderDisplayLines(
  items: ReadonlyArray<OrderItemDisplaySource>
): OrderDisplayLine[] {
  const sorted = [...items].sort(
    (a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0) || a.id.localeCompare(b.id)
  );

  const packageMap = new Map<
    string,
    OrderDisplayPackageLine & { _amtSort: number }
  >();
  const orphanComps: OrderItemDisplaySource[] = [];
  const products: OrderDisplayProductLine[] = [];
  const orderKeys: string[] = [];

  for (const item of sorted) {
    const amt = parsePackageAmountMemo(item.memo);
    if (amt) {
      const amount = toNumber(item.amount);
      const qty = amt.packageQty;
      const unit =
        qty > 0 ? Math.round(amount / qty) : toNumber(item.unit_price);
      const key = `pkg-${amt.casePackageId}`;
      if (!packageMap.has(amt.casePackageId)) {
        packageMap.set(amt.casePackageId, {
          kind: "PACKAGE",
          key,
          package_name: amt.packageName,
          quantity: qty,
          unit_price: unit,
          amount,
          components: [],
          _amtSort: item.sort_order || 0,
        });
        orderKeys.push(key);
      }
      continue;
    }

    const custom = parseCustomOrderItemMemo(item.memo);
    if (custom) {
      const key = `custom-${item.id}`;
      products.push({
        kind: "PRODUCT",
        key,
        product_name: custom.lineName,
        manufacturer_name: custom.manufacturer,
        model_no: custom.lineName,
        quantity: toNumber(item.quantity) || 0,
        unit_price: toNumber(item.unit_price),
        amount: toNumber(item.amount),
        memo: custom.userMemo,
      });
      orderKeys.push(key);
      continue;
    }

    const comp = parsePackageComponentMemo(item.memo);
    if (comp) {
      const pkg = packageMap.get(comp.casePackageId);
      const component = {
        key: item.id,
        product_name: item.product_name || "名称未設定",
        manufacturer_name: item.manufacturer_name || "",
        model_no: item.model_no || "",
        quantity: toNumber(item.quantity) || 0,
        memo: "",
      };
      if (pkg) {
        pkg.components.push(component);
      } else {
        orphanComps.push(item);
      }
      continue;
    }

    const key = `prod-${item.id}`;
    products.push({
      kind: "PRODUCT",
      key,
      product_name: item.product_name || "名称未設定",
      manufacturer_name: item.manufacturer_name || "",
      model_no: item.model_no || "",
      quantity: toNumber(item.quantity) || 0,
      unit_price: toNumber(item.unit_price),
      amount: toNumber(item.amount),
      memo: displaySafeOrderItemMemo(item.memo),
    });
    orderKeys.push(key);
  }

  // PKG_AMT より先に COMP だけ来た場合の救済
  for (const item of orphanComps) {
    const comp = parsePackageComponentMemo(item.memo);
    if (!comp) continue;
    let pkg = packageMap.get(comp.casePackageId);
    if (!pkg) {
      const key = `pkg-${comp.casePackageId}`;
      pkg = {
        kind: "PACKAGE",
        key,
        package_name: "パッケージ",
        quantity: 1,
        unit_price: 0,
        amount: 0,
        components: [],
        _amtSort: item.sort_order || 0,
      };
      packageMap.set(comp.casePackageId, pkg);
      orderKeys.push(key);
    }
    pkg.components.push({
      key: item.id,
      product_name: item.product_name || "名称未設定",
      manufacturer_name: item.manufacturer_name || "",
      model_no: item.model_no || "",
      quantity: toNumber(item.quantity) || 0,
      memo: "",
    });
  }

  const productByKey = new Map(products.map((p) => [p.key, p]));
  const result: OrderDisplayLine[] = [];
  const seen = new Set<string>();
  for (const key of orderKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (key.startsWith("pkg-")) {
      const id = key.slice(4);
      const pkg = packageMap.get(id);
      if (!pkg) continue;
      const { _amtSort: _, ...rest } = pkg;
      result.push(rest);
      continue;
    }
    const prod = productByKey.get(key);
    if (prod) result.push(prod);
  }

  return result;
}

/** 納品書: パッケージ金額行は除外し、構成数量行＋通常商品のみ */
export function buildDeliveryQuantityLines(
  items: ReadonlyArray<OrderItemDisplaySource>
): OrderItemDisplaySource[] {
  return items.filter((item) => !parsePackageAmountMemo(item.memo));
}
