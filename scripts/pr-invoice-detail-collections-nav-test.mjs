/**
 * 請求詳細の主導線を回収管理へ統一する契約テスト
 * Run: node scripts/pr-invoice-detail-collections-nav-test.mjs
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

const detail = read("app/invoices/[id]/page.tsx");
const sidebar = read("app/components/AppSidebar.tsx");

assert(
  "primary back link is collections",
  detail.includes('href="/queues/collections"') &&
    detail.includes("← 回収管理へ戻る")
);
assert(
  "payment registration CTA kept",
  detail.includes("`/invoices/${invoice.id}/payments/new`") &&
    detail.includes("＋ 入金登録")
);
assert(
  "print CTA kept",
  detail.includes("`/invoices/${invoice.id}/print`") &&
    detail.includes("請求書PDF")
);
assert(
  "broken edit links removed",
  !detail.includes("/edit") &&
    !detail.includes(">編集<") &&
    !detail.includes("請求情報を編集")
);
assert(
  "list back links removed from detail",
  !detail.includes("一覧へ戻る") &&
    !detail.includes("請求一覧へ戻る") &&
    !detail.includes('href="/invoices"')
);
assert(
  "legacy /invoices page kept for compatibility",
  existsSync(join(ROOT, "app/invoices/page.tsx"))
);
assert(
  "no invoice edit route exists",
  !existsSync(join(ROOT, "app/invoices/[id]/edit/page.tsx"))
);
assert(
  "sidebar has collections, not 請求管理",
  sidebar.includes('href: "/queues/collections"') &&
    sidebar.includes('name: "回収管理"') &&
    !sidebar.includes('name: "請求管理"') &&
    !sidebar.includes('href: "/invoices"')
);

const porcelain =
  spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout || "";

assert(
  "no forbidden area changes",
  !/supabase\/migrations\//.test(porcelain) &&
    !/WorkflowEngine/.test(porcelain) &&
    !/settlementRules/.test(porcelain) &&
    !/app\/dealer\//.test(porcelain) &&
    !/invoiceTax/.test(porcelain) &&
    !/createPaymentPayload/.test(porcelain) &&
    !/app\/api\//.test(porcelain)
);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(tsc.stdout || "");
process.stderr.write(tsc.stderr || "");
assert("tsc --noEmit", tsc.status === 0, `status=${tsc.status}`);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
});
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
assert("npm run build", build.status === 0, `status=${build.status}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll invoice detail collections-nav checks passed");
