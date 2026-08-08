/**
 * PR: 商品/パッケージ詳細ページ新設
 * 実行: node scripts/pr-product-package-detail-pages-test.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

assert(
  "product detail route exists",
  existsSync(join(ROOT, "app/products/[id]/page.tsx"))
);
assert(
  "package detail route exists",
  existsSync(join(ROOT, "app/packages/[id]/page.tsx"))
);

const productDetail = read("app/products/[id]/page.tsx");
const packageDetail = read("app/packages/[id]/page.tsx");
const productEdit = read("app/products/[id]/edit/page.tsx");
const packageEdit = read("app/packages/[id]/edit/page.tsx");
const productsList = read("app/products/page.tsx");
const packagesList = read("app/packages/page.tsx");
const productNotFound = read("app/products/[id]/not-found.tsx");
const packageNotFound = read("app/packages/[id]/not-found.tsx");

assert(
  "product list links to detail via model/name + 詳細",
  productsList.includes("href={`/products/${item.id}`}") &&
    productsList.includes("詳細") &&
    productsList.includes("href={`/products/${item.id}/edit`}") &&
    productsList.includes("/prices/new?product_id=") &&
    productsList.includes("/sales-prices/new?product_id=")
);

assert(
  "package list links to detail via name + 詳細",
  packagesList.includes("href={`/packages/${item.id}`}") &&
    packagesList.includes("詳細") &&
    packagesList.includes("href={`/packages/${item.id}/edit`}") &&
    packagesList.includes("/prices/new?package_id=") &&
    packagesList.includes("/sales-prices/new?package_id=")
);

assert(
  "product detail has info CTAs and MasterPricePanels PRODUCT",
  productDetail.includes("商品一覧へ戻る") &&
    productDetail.includes(`/products/\${id}/edit`) &&
    productDetail.includes("/prices/new?product_id=") &&
    productDetail.includes("/sales-prices/new?product_id=") &&
    productDetail.includes("MasterPricePanels") &&
    productDetail.includes('targetType="PRODUCT"') &&
    productDetail.includes("notFound()")
);

assert(
  "package detail has composition + MasterPricePanels PACKAGE",
  packageDetail.includes("パッケージ一覧へ戻る") &&
    packageDetail.includes("パッケージ構成商品") &&
    packageDetail.includes("package_items") &&
    packageDetail.includes("MasterPricePanels") &&
    packageDetail.includes('targetType="PACKAGE"') &&
    packageDetail.includes("notFound()")
);

assert(
  "edit pages no longer host price panels",
  !productEdit.includes("MasterPricePanels") &&
    !packageEdit.includes("MasterPricePanels")
);

assert(
  "edit save/cancel return to detail",
  productEdit.includes("router.push(`/products/${id}`)") &&
    packageEdit.includes("router.push(`/packages/${id}`)") &&
    (productEdit.match(/router\.push\(`\/products\/\$\{id\}`\)/g) || [])
      .length >= 2 &&
    (packageEdit.match(/router\.push\(`\/packages\/\$\{id\}`\)/g) || [])
      .length >= 2
);

assert(
  "404 not-found pages exist",
  productNotFound.includes("商品が見つかりません") &&
    packageNotFound.includes("パッケージ商品が見つかりません")
);

assert(
  "no forbidden domain changes in this PR surface",
  !productDetail.includes("WorkflowEngine") &&
    !productDetail.includes("supabase/migrations") &&
    !packageDetail.includes(".insert(") &&
    !productDetail.includes(".update(")
);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(tsc.stdout || "");
process.stderr.write(tsc.stderr || "");
assert("tsc --noEmit", tsc.status === 0, `status=${tsc.status}`);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, CI: "true" },
});
if (build.status !== 0) {
  process.stdout.write(build.stdout || "");
  process.stderr.write(build.stderr || "");
}
assert("npm run build", build.status === 0, `status=${build.status}`);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall product/package detail page checks passed");
