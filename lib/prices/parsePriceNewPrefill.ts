import type { PriceTargetType } from "@/lib/prices/targetType";

/**
 * /prices/new および /sales-prices/new の query プリフィル。
 * 保存ルールは変更しない（初期選択のみ）。
 *
 * - ?product_id= → PRODUCT
 * - ?package_id= → PACKAGE
 * - 両方ある場合は product_id を優先
 * - どちらも無い場合は従来どおり（PRODUCT・未選択）
 */
export type PriceNewPrefill = {
  price_target_type: PriceTargetType;
  product_id: string;
  package_id: string;
  fromQuery: boolean;
};

export function parsePriceNewPrefill(params: {
  product_id?: string | null;
  package_id?: string | null;
}): PriceNewPrefill {
  const productId = (params.product_id || "").trim();
  const packageId = (params.package_id || "").trim();

  if (productId) {
    return {
      price_target_type: "PRODUCT",
      product_id: productId,
      package_id: "",
      fromQuery: true,
    };
  }

  if (packageId) {
    return {
      price_target_type: "PACKAGE",
      product_id: "",
      package_id: packageId,
      fromQuery: true,
    };
  }

  return {
    price_target_type: "PRODUCT",
    product_id: "",
    package_id: "",
    fromQuery: false,
  };
}

export type PriceTargetSummary = {
  kindLabel: string;
  manufacturerName: string;
  codeLabel: string;
  code: string;
  name: string;
};

export function buildProductPriceSummary(product: {
  name?: string | null;
  model_no?: string | null;
  manufacturerName?: string | null;
}): PriceTargetSummary {
  return {
    kindLabel: "商品",
    manufacturerName: (product.manufacturerName || "").trim() || "—",
    codeLabel: "型番",
    code: (product.model_no || "").trim() || "—",
    name: (product.name || "").trim() || "—",
  };
}

export function buildPackagePriceSummary(pkg: {
  name?: string | null;
  package_code?: string | null;
  manufacturerName?: string | null;
}): PriceTargetSummary {
  return {
    kindLabel: "パッケージ商品",
    manufacturerName: (pkg.manufacturerName || "").trim() || "—",
    codeLabel: "コード",
    code: (pkg.package_code || "").trim() || "—",
    name: (pkg.name || "").trim() || "—",
  };
}
