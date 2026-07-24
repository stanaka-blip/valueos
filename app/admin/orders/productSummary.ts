type NamedRelation = {
  name: string | null;
} | null;

type CasePackageRelation = {
  package_name_snapshot?: string | null;
  packages?: NamedRelation | NamedRelation[] | null;
} | null;

type CaseProductRelation = {
  products?: NamedRelation | NamedRelation[] | null;
} | null;

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] || null : value;
}

function getPackageName(pkg: CasePackageRelation): string | null {
  if (!pkg) {
    return null;
  }

  if (pkg.package_name_snapshot) {
    return pkg.package_name_snapshot;
  }

  const related = getSingleRelation(pkg.packages);
  return related?.name || null;
}

function getProductName(item: CaseProductRelation): string | null {
  if (!item) {
    return null;
  }

  const related = getSingleRelation(item.products);
  return related?.name || null;
}

/**
 * Product summary priority:
 * 1. Package order → package name
 * 2. Parts-only → first product name (+ ほかN点)
 * 3. Fallback → cases.product_name
 */
export function buildProductSummary(params: {
  orderType: string | null | undefined;
  productName: string | null | undefined;
  casePackages: CasePackageRelation[] | CasePackageRelation | null | undefined;
  caseProducts: CaseProductRelation[] | CaseProductRelation | null | undefined;
}): string {
  const packages = Array.isArray(params.casePackages)
    ? params.casePackages
    : params.casePackages
      ? [params.casePackages]
      : [];

  const products = Array.isArray(params.caseProducts)
    ? params.caseProducts
    : params.caseProducts
      ? [params.caseProducts]
      : [];

  const packageNames = packages
    .map((item) => getPackageName(item))
    .filter((name): name is string => Boolean(name));

  if (packageNames.length > 0) {
    return packageNames[0];
  }

  if (
    params.orderType === "パッケージで発注" &&
    params.productName
  ) {
    return params.productName;
  }

  const productNames = products
    .map((item) => getProductName(item))
    .filter((name): name is string => Boolean(name));

  if (productNames.length === 1) {
    return productNames[0];
  }

  if (productNames.length > 1) {
    return `${productNames[0]} ほか${productNames.length - 1}点`;
  }

  return params.productName || "-";
}
