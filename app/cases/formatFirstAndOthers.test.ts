/**
 * 全案件一覧の列集計ヘルパーテスト
 *
 * 実行:
 *   npx tsx --test app/cases/formatFirstAndOthers.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatFirstAndOthers } from "@/app/cases/formatFirstAndOthers";
import {
  summarizeCaseManufacturers,
  summarizeCaseModelNumbers,
} from "@/app/cases/caseListLineSummary";

test("formatFirstAndOthers: empty → dash", () => {
  assert.equal(formatFirstAndOthers([]), "—");
  assert.equal(formatFirstAndOthers([null, "", "  "]), "—");
});

test("formatFirstAndOthers: single label stays as-is", () => {
  assert.equal(formatFirstAndOthers(["ダイキン"]), "ダイキン");
});

test("formatFirstAndOthers: multiple unique → first + 他N件", () => {
  assert.equal(
    formatFirstAndOthers(["ダイキン", "三菱", "日立"]),
    "ダイキン\n他2件"
  );
  assert.equal(
    formatFirstAndOthers(["S40ZTEP", "RAS-XJ", "RAS-XK"]),
    "S40ZTEP\n他2件"
  );
});

test("formatFirstAndOthers: duplicates do not inflate count", () => {
  assert.equal(
    formatFirstAndOthers(["ダイキン", "ダイキン", "三菱"]),
    "ダイキン\n他1件"
  );
});

test("summarizeCaseManufacturers / ModelNumbers from case_products lines", () => {
  const lines = [
    {
      line_type: "PRODUCT",
      products: {
        name: "ルームエアコン",
        model_no: "S40ZTEP",
        manufacturers: { name: "ダイキン" },
      },
      packages: null,
    },
    {
      line_type: "PRODUCT",
      products: {
        name: "室外機",
        model_no: "RAS-XJ28T",
        manufacturers: { name: "ダイキン" },
      },
      packages: null,
    },
    {
      line_type: "PACKAGE",
      products: null,
      packages: {
        name: "オール電化セット",
        manufacturers: { name: "パナソニック" },
      },
    },
  ];

  assert.equal(summarizeCaseManufacturers(lines), "ダイキン\n他1件");
  assert.equal(summarizeCaseModelNumbers(lines), "S40ZTEP\n他2件");
});

test("PACKAGE: model_no when product linked, else package name fallback", () => {
  assert.equal(
    summarizeCaseModelNumbers([
      {
        line_type: "PACKAGE",
        products: { name: "構成商品", model_no: "PKG-MODEL-1" },
        packages: { name: "長い商品説明パッケージ名" },
      },
    ]),
    "PKG-MODEL-1"
  );
  assert.equal(
    summarizeCaseModelNumbers([
      {
        line_type: "PACKAGE",
        products: null,
        packages: { name: "パッケージ名のみ" },
      },
    ]),
    "パッケージ名のみ"
  );
});

test("cases list page uses model_no in query", () => {
  const source = readFileSync(join(process.cwd(), "app/cases/page.tsx"), "utf8");
  assert.match(source, /loadAllCaseSettlementsAdmin/);
  assert.match(source, /summarizeCaseManufacturers/);
  assert.match(source, /summarizeCaseModelNumbers/);
  assert.match(source, /model_no/);
  assert.doesNotMatch(source, /summarizeCaseProducts/);
  assert.doesNotMatch(source, /sales_price/);
  assert.doesNotMatch(source, /gross_profit/);
});

test("CasesList columns: 型番 replaces 商材", () => {
  const source = readFileSync(
    join(process.cwd(), "app/cases/CasesList.tsx"),
    "utf8"
  );
  assert.doesNotMatch(source, />商材</);
  assert.doesNotMatch(source, /productSummary/);
  assert.match(source, />型番</);
  assert.match(source, />発注メーカー</);
  const order = [
    "案件番号",
    "販売店",
    "顧客",
    "決済条件",
    "希望納期",
    "発注メーカー",
    "型番",
    "ステータス",
  ];
  let last = -1;
  for (const label of order) {
    const idx = source.indexOf(`>${label}`);
    assert.ok(idx > last, `column ${label} order`);
    last = idx;
  }
});

test("no DB/API/Workflow/dealer touch in this change set (static scope)", () => {
  const page = readFileSync(join(process.cwd(), "app/cases/page.tsx"), "utf8");
  assert.doesNotMatch(page, /from "@\/app\/dealer/);
  assert.doesNotMatch(page, /WorkflowEngine|SETTLEMENT_RULES/);
});
