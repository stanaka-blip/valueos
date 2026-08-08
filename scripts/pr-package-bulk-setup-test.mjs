/**
 * パッケージ一括登録の静的回帰
 * 実行: node scripts/pr-package-bulk-setup-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const mig = readFileSync(
  join(
    root,
    "supabase/migrations/20260808190000_create_package_bulk_setup_rpc.sql"
  ),
  "utf8"
);
const page = readFileSync(join(root, "app/packages/bulk/page.tsx"), "utf8");
const packagesPage = readFileSync(join(root, "app/packages/page.tsx"), "utf8");
const packagesNew = readFileSync(
  join(root, "app/packages/new/page.tsx"),
  "utf8"
);
const api = readFileSync(
  join(root, "app/api/package-bulk-setups/route.ts"),
  "utf8"
);
const authCookie = readFileSync(
  join(root, "lib/gateway/authCookie.ts"),
  "utf8"
);
const sidebar = readFileSync(
  join(root, "app/components/AppSidebar.tsx"),
  "utf8"
);

const priorMigs = [
  "20260808140000_create_product_setup_rpc.sql",
  "20260808160000_create_existing_product_price_setup_rpc.sql",
  "20260808170000_create_supplier_purchase_prices_rpc.sql",
  "20260808180000_create_dealer_sales_prices_rpc.sql",
].map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8"));

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok - ${name}`);
}

assert(
  "RPC は create_package_bulk_setup",
  mig.includes("create_package_bulk_setup")
);
assert(
  "ledger + 冪等",
  mig.includes("package_bulk_setup_requests") &&
    mig.includes("payload_hash") &&
    mig.includes("idempotent_replay") &&
    mig.includes("REQUEST_ID_CONFLICT") &&
    mig.includes("REQUEST_IN_PROGRESS")
);
assert(
  "atomic EXCEPTION rollback",
  mig.includes("EXCEPTION") &&
    mig.includes("INSERT INTO public.packages") &&
    mig.includes("INSERT INTO public.package_items")
);
assert(
  "既存 packages UPDATE/DELETE なし",
  !/UPDATE\s+public\.packages/i.test(mig) &&
    !/DELETE\s+FROM\s+public\.packages/i.test(mig)
);
assert(
  "既存 package_items UPDATE/DELETE なし",
  !/UPDATE\s+public\.package_items/i.test(mig) &&
    !/DELETE\s+FROM\s+public\.package_items/i.test(mig)
);
assert(
  "価格 INSERT なし（別PR方針）",
  !/INSERT\s+INTO\s+public\.purchase_prices/i.test(mig) &&
    !/INSERT\s+INTO\s+public\.sales_prices/i.test(mig)
);
assert(
  "構成必須・product重複拒否・quantity>0",
  mig.includes("構成商品が1件以上必要です") &&
    mig.includes("同じ商品が複数行に入力されています") &&
    mig.includes("数量は1以上で入力してください")
);
assert(
  "同一リクエスト内パッケージ名重複拒否",
  mig.includes("同じパッケージ名が複数行に入力されています")
);
assert(
  "gateway CSRF/Idempotency/Origin",
  api.includes("assertCsrf") &&
    api.includes("Idempotency-Key") &&
    api.includes("derivePackageBulkSetupRequestId") &&
    api.includes("assertAppOrigin")
);
assert(
  "namespace 分離",
  authCookie.includes("package-bulk-setup:v1")
);
assert(
  "UI /packages/bulk",
  page.includes("パッケージ一括登録") &&
    page.includes("他メーカー商品も表示") &&
    page.includes("matchesProductSearch")
);
assert(
  "一覧 CTA",
  packagesPage.includes("/packages/bulk") &&
    packagesPage.includes("パッケージ一括登録")
);
assert(
  "/packages/new 維持",
  packagesPage.includes("/packages/new") &&
    packagesNew.includes('from("packages")') &&
    packagesNew.includes("insert")
);
assert(
  "サイドバーに新規項目なし",
  !sidebar.includes("/packages/bulk")
);
assert(
  "service_role のみ EXECUTE",
  mig.includes("GRANT EXECUTE ON FUNCTION public.create_package_bulk_setup") &&
    mig.includes("REVOKE ALL ON FUNCTION public.create_package_bulk_setup")
);

for (const [i, prior] of priorMigs.entries()) {
  assert(
    `prior migration ${i + 1} を変更しない（別ファイル）`,
    prior.includes("CREATE OR REPLACE FUNCTION") ||
      prior.includes("create_product_setup") ||
      prior.includes("create_supplier") ||
      prior.includes("create_dealer") ||
      prior.includes("create_existing")
  );
}

assert(
  "新migrationが prior RPC 名を書き換えない",
  !mig.includes("create_product_setup(") &&
    !mig.includes("create_existing_product_price_setup(") &&
    !mig.includes("create_supplier_purchase_prices(") &&
    !mig.includes("create_dealer_sales_prices(")
);

if (process.exitCode) {
  console.error("\nfailed");
  process.exit(1);
}
console.log("\nall checks passed");
