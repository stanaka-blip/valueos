/**
 * 商品・パッケージ一覧の標準仕入先列 静的チェック
 * Run: node scripts/pr-list-default-supplier-column-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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

const productsSrc = read("app/products/page.tsx");
const packagesSrc = read("app/packages/page.tsx");

assert("products list has 標準仕入先 header", productsSrc.includes(">標準仕入先<"));
assert(
  "products list joins suppliers via default_supplier_id",
  productsSrc.includes("suppliers:default_supplier_id ( name )")
);
assert("products list shows 未設定", productsSrc.includes("未設定"));
assert("packages list has 標準仕入先 header", packagesSrc.includes(">標準仕入先<"));
assert(
  "packages list joins suppliers via default_supplier_id",
  packagesSrc.includes("suppliers:default_supplier_id ( name )")
);
assert("packages list shows 未設定", packagesSrc.includes("未設定"));

const forbidden = spawnSync(
  "git",
  [
    "diff",
    "--name-only",
    "origin/main",
    "--",
    "app/dealer",
    "app/cases",
    "app/components/case-registration",
    "app/products/new",
    "app/products/[id]",
    "app/packages/new",
    "app/packages/[id]",
    "supabase/migrations",
    "lib/gateway",
    "app/api",
    "proxy.ts",
  ],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "no dealer/cases/edit/new/migration/rpc/api changes",
  (forbidden.stdout || "").trim() === "",
  forbidden.stdout
);

if (failed) {
  console.error("\nFAILED", failed);
  process.exit(1);
}
console.log("\nALL LIST DEFAULT SUPPLIER COLUMN CHECKS PASSED");
