/**
 * パッケージ利用停止の純関数テスト
 * Run: npx tsx app/packages/packageActiveStatus.test.ts
 */
import assert from "node:assert/strict";

import { isPackageActiveFlag } from "./packageListQuery";
import {
  nextPackageActiveValue,
  PACKAGE_DEACTIVATE_CONFIRM,
  packageStatusLabel,
  toPackageActiveDbValue,
} from "./packageActiveStatus";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("OK", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, e);
  }
}

check("is_active 判定とラベル", () => {
  assert.equal(isPackageActiveFlag(true), true);
  assert.equal(isPackageActiveFlag("true"), true);
  assert.equal(isPackageActiveFlag(false), false);
  assert.equal(isPackageActiveFlag("false"), false);
  assert.equal(isPackageActiveFlag(null), false);
  assert.equal(packageStatusLabel(true), "有効");
  assert.equal(packageStatusLabel(false), "利用停止");
});

check("書き込み値は boolean", () => {
  assert.equal(toPackageActiveDbValue(true), true);
  assert.equal(toPackageActiveDbValue(false), false);
  assert.equal(toPackageActiveDbValue(nextPackageActiveValue(true)), false);
});

check("確認文に利用停止が含まれる", () => {
  assert.match(PACKAGE_DEACTIVATE_CONFIRM, /利用停止/);
  assert.match(PACKAGE_DEACTIVATE_CONFIRM, /選択候補/);
});

if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("All packageActiveStatus tests passed");
