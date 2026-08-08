/**
 * PR: 商品・パッケージ一覧の検索/フィルタ（DB書込なし）
 * 実行: node scripts/pr-products-packages-list-search-test.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const productsPage = read("app/products/page.tsx");
const packagesPage = read("app/packages/page.tsx");
const productForm = read("app/products/ProductListSearchForm.tsx");
const packageForm = read("app/packages/PackageListSearchForm.tsx");
const productQuery = read("app/products/productListQuery.ts");
const packageQuery = read("app/packages/packageListQuery.ts");

assert(
  "products page wires searchParams + filter helper",
  productsPage.includes("searchParams") &&
    productsPage.includes("parseProductListQuery") &&
    productsPage.includes("filterProductListRows") &&
    productsPage.includes("ProductListSearchForm")
);

assert(
  "packages page wires searchParams + filter helper",
  packagesPage.includes("searchParams") &&
    packagesPage.includes("parsePackageListQuery") &&
    packagesPage.includes("filterPackageListRows") &&
    packagesPage.includes("PackageListSearchForm")
);

assert(
  "product search UI fields",
  productForm.includes("型番・商品名・メーカーで検索") &&
    productForm.includes('name="manufacturer_id"') &&
    productForm.includes('name="category"') &&
    productForm.includes('name="status"') &&
    productForm.includes("有効") &&
    productForm.includes("無効") &&
    productForm.includes("すべて")
);

assert(
  "package search UI fields",
  packageForm.includes("パッケージ名・メーカー名・シリーズ名で検索") &&
    packageForm.includes('name="manufacturer_id"') &&
    packageForm.includes('name="status"') &&
    !packageForm.includes('name="category"')
);

assert(
  "default status preserves current ops (all)",
  productQuery.includes('DEFAULT_PRODUCT_LIST_STATUS: ProductListStatusFilter = "all"') &&
    packageQuery.includes('DEFAULT_PACKAGE_LIST_STATUS: PackageListStatusFilter = "all"')
);

assert(
  "empty filter messaging",
  productsPage.includes("条件に一致する商品がありません") &&
    packagesPage.includes("条件に一致するパッケージがありません")
);

assert(
  "no price/CRM forbidden changes in this PR surface",
  !productsPage.includes("purchase_prices") &&
    !productsPage.includes("sales_prices") &&
    !packagesPage.includes("purchase_prices") &&
    !productsPage.includes("WorkflowEngine") &&
    !productQuery.includes("supabase/migrations")
);

const behavior = spawnSync(
  "npx",
  ["tsx", "scripts/pr-products-packages-list-search-behavior.mts"],
  { cwd: ROOT, encoding: "utf8" }
);
process.stdout.write(behavior.stdout || "");
process.stderr.write(behavior.stderr || "");
assert("behavior exit 0", behavior.status === 0, `status=${behavior.status}`);

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
console.log("\nall products/packages list search checks passed");
