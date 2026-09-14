import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function ok(name: string) {
  console.log("OK", name);
}

{
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  assert.match(css, /color-scheme:\s*light/);
  assert.doesNotMatch(
    css,
    /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/
  );
  assert.match(css, /--foreground:\s*#171717/);
  assert.doesNotMatch(css, /--foreground:\s*#ededed/);
  ok("globals.css keeps light foreground without dark media override");
}

{
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /className="light"/);
  assert.match(layout, /text-gray-900/);
  ok("layout pins light class and gray-900 text");
}

{
  const sidebar = readFileSync(
    join(root, "app/components/AppSidebar.tsx"),
    "utf8"
  );
  assert.doesNotMatch(sidebar, /name:\s*"入金管理"/);
  assert.doesNotMatch(sidebar, /name:\s*"請求一覧"/);
  assert.match(sidebar, /href:\s*"\/queues\/collections"/);
  assert.match(sidebar, /href:\s*"\/settings\/password"/);
  // route ファイル自体は残っていること（ナビから外すだけ）
  assert.ok(
    readFileSync(join(root, "app/payments/page.tsx"), "utf8").length > 0
  );
  assert.ok(
    readFileSync(join(root, "app/invoices/page.tsx"), "utf8").length > 0
  );
  ok("sidebar hides 入金管理/請求一覧; routes and settings/password remain");
}

console.log("phase1LightUiAndSidebar.test.ts passed");
