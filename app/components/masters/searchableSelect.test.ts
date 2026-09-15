/**
 * searchableSelect / 商品複製の純関数テスト
 * Run: npx tsx app/components/masters/searchableSelect.test.ts
 */
import assert from "node:assert/strict";

import {
  buildPackageSearchOption,
  buildProductCopyFormValues,
  buildProductSearchOption,
  DUPLICATE_MODEL_NO_MESSAGE,
  filterSearchableOptions,
  matchesSearchableQuery,
} from "./searchableSelect";

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

const sample = buildProductSearchOption({
  id: "p1",
  name: "スマートPVマルチ",
  model_no: "CS-390N11",
  manufacturer_name: "長州産業",
  category: "蓄電池",
  series_name: "Smart PV",
});

check("B: 型番部分一致 CS-390 / 390N11 / 390", () => {
  assert.equal(matchesSearchableQuery(sample.searchText, "CS-390"), true);
  assert.equal(matchesSearchableQuery(sample.searchText, "390N11"), true);
  assert.equal(matchesSearchableQuery(sample.searchText, "390"), true);
  assert.equal(matchesSearchableQuery(sample.searchText, "cs-390"), true);
  assert.equal(matchesSearchableQuery(sample.searchText, "ZZZ"), false);
});

check("C: 日本語商品名の部分一致", () => {
  assert.equal(matchesSearchableQuery(sample.searchText, "スマート"), true);
  assert.equal(matchesSearchableQuery(sample.searchText, "PVマルチ"), true);
});

check("D: メーカー名検索", () => {
  assert.equal(matchesSearchableQuery(sample.searchText, "長州"), true);
  assert.equal(matchesSearchableQuery(sample.searchText, "産業"), true);
});

check("候補表示に型番・メーカーが含まれる", () => {
  assert.match(sample.primaryText, /CS-390N11/);
  assert.match(sample.secondaryText || "", /長州産業/);
  assert.match(sample.secondaryText || "", /蓄電池/);
  assert.match(sample.label, /スマートPVマルチ/);
  assert.match(sample.label, /CS-390N11/);
});

check("filter は limit を守る", () => {
  const options = Array.from({ length: 100 }, (_, i) =>
    buildProductSearchOption({
      id: `p${i}`,
      name: `商品${i}`,
      model_no: `M-${i}`,
    })
  );
  assert.equal(filterSearchableOptions(options, "", 80).length, 80);
  assert.equal(filterSearchableOptions(options, "M-1", 80).length > 0, true);
});

check("A: 商品複製フィールド（価格・idは含めない）", () => {
  const copied = buildProductCopyFormValues({
    manufacturer_id: "m1",
    series_id: "s1",
    category: "蓄電池",
    model_no: "CS-390N11",
    name: "スマートPVマルチ",
    capacity: "12.7",
    unit: "kWh",
    memo: "保証10年",
    is_active: true,
    default_supplier_id: "sup1",
  });
  assert.equal(copied.manufacturer_id, "m1");
  assert.equal(copied.series_id, "s1");
  assert.equal(copied.model_no, "CS-390N11");
  assert.equal(copied.name, "スマートPVマルチ");
  assert.equal(copied.default_supplier_id, "sup1");
  assert.equal(copied.is_active, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(copied, "id"),
    false
  );
  assert.equal(DUPLICATE_MODEL_NO_MESSAGE.includes("型番を変更"), true);
});

check("0円相当: is_active 文字列 true も有効", () => {
  const copied = buildProductCopyFormValues({
    manufacturer_id: "m1",
    series_id: null,
    category: null,
    model_no: "X",
    name: "Y",
    capacity: null,
    unit: null,
    memo: null,
    is_active: "true",
    default_supplier_id: null,
  });
  assert.equal(copied.is_active, true);
  assert.equal(copied.series_id, "");
});

check("パッケージ候補も型番相当コードで検索できる", () => {
  const option = buildPackageSearchOption({
    id: "pkg1",
    name: "蓄電池セット",
    package_code: "PKG-390",
  });
  assert.equal(matchesSearchableQuery(option.searchText, "390"), true);
  assert.equal(matchesSearchableQuery(option.searchText, "蓄電池"), true);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll searchableSelect checks passed");
