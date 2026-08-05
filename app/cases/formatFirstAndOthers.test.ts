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
  summarizeCaseProducts,
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
    formatFirstAndOthers(["ルームエアコン", "室外機", "配管", "リモコン"]),
    "ルームエアコン\n他3件"
  );
});

test("formatFirstAndOthers: duplicates do not inflate count", () => {
  assert.equal(
    formatFirstAndOthers(["ダイキン", "ダイキン", "三菱"]),
    "ダイキン\n他1件"
  );
});

test("summarizeCaseManufacturers / Products from case_products lines", () => {
  const lines = [
    {
      line_type: "PRODUCT",
      products: {
        name: "ルームエアコン",
        manufacturers: { name: "ダイキン" },
      },
      packages: null,
    },
    {
      line_type: "PRODUCT",
      products: {
        name: "室外機",
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
  assert.equal(summarizeCaseProducts(lines), "ルームエアコン\n他2件");
});

test("cases list page uses admin settlements and nested product lines", () => {
  const source = readFileSync(join(process.cwd(), "app/cases/page.tsx"), "utf8");
  assert.match(source, /loadAllCaseSettlementsAdmin/);
  assert.match(source, /summarizeCaseManufacturers/);
  assert.match(source, /summarizeCaseProducts/);
  assert.match(source, /manufacturers\s*\(/);
  assert.doesNotMatch(source, /sales_price/);
  assert.doesNotMatch(source, /gross_profit/);
});

test("CasesList columns: removed and added", () => {
  const source = readFileSync(
    join(process.cwd(), "app/cases/CasesList.tsx"),
    "utf8"
  );
  assert.doesNotMatch(source, />登録日</);
  assert.doesNotMatch(source, />売上</);
  assert.doesNotMatch(source, />粗利</);
  assert.doesNotMatch(source, /salesTotal|profitTotal|formatYen/);
  assert.match(source, />決済条件</);
  assert.match(source, />希望納期</);
  assert.match(source, />発注メーカー</);
  assert.match(source, />商材</);
  // column order (relative)
  const order = [
    "案件番号",
    "販売店",
    "顧客",
    "決済条件",
    "希望納期",
    "発注メーカー",
    "商材",
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
  // helpers stay under app/cases
  const page = readFileSync(join(process.cwd(), "app/cases/page.tsx"), "utf8");
  assert.doesNotMatch(page, /from "@\/app\/dealer/);
  assert.doesNotMatch(page, /WorkflowEngine|SETTLEMENT_RULES/);
});
