/**
 * 請求明細ユニットテスト
 *
 * 実行: npx tsx lib/invoices/invoiceLineItems.test.ts
 */
import assert from "node:assert/strict";

import { calculateInvoiceAmountInclusive } from "@/lib/invoices/invoiceTax";
import { buildInvoiceTaxSnapshotForSave } from "@/lib/invoices/invoiceTaxSnapshot";
import { resolveInvoicePrintTaxDisplay } from "@/lib/invoices/invoicePrintTaxDisplay";
import {
  buildAutofillCompatFromLineDrafts,
  buildInvoiceLineDraftsFromCaseSeeds,
  buildInvoiceTotalsFromLines,
  draftAmountExTax,
  emptyCustomInvoiceLine,
  sumIncludedLineAmounts,
  validateAndBuildInvoiceLineInserts,
  type InvoiceLineDraft,
} from "@/lib/invoices/invoiceLineItems";

type Case = { name: string; run: () => void };
const tests: Case[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

function productDraft(
  patch: Partial<InvoiceLineDraft> = {}
): InvoiceLineDraft {
  return {
    key: "p1",
    included: true,
    line_kind: "product",
    description: "HEMS",
    quantity: "1",
    unit: "台",
    unit_price_ex_tax: "100000",
    tax_rate: "0.1",
    memo: "",
    case_product_id: "cp-1",
    source_product_id: "prod-1",
    source_package_id: null,
    ...patch,
  };
}

function packageDraft(
  patch: Partial<InvoiceLineDraft> = {}
): InvoiceLineDraft {
  return {
    key: "pkg1",
    included: true,
    line_kind: "package",
    description: "蓄電池セット",
    quantity: "1",
    unit: "式",
    unit_price_ex_tax: "1200000",
    tax_rate: "0.1",
    memo: "",
    case_product_id: "cp-2",
    source_product_id: null,
    source_package_id: "pkg-1",
    ...patch,
  };
}

test("商品だけの請求書明細", () => {
  const drafts = [productDraft()];
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines.length, 1);
  assert.equal(validated.lines[0].line_kind, "product");
  assert.equal(validated.lines[0].description, "HEMS");
  assert.equal(validated.lines[0].amount_ex_tax, 100000);
  const totals = buildInvoiceTotalsFromLines(drafts);
  assert.equal(totals.subtotalExTax, 100000);
  assert.equal(totals.tax, 10000);
  assert.equal(totals.invoiceAmountInclusive, 110000);
});

test("パッケージだけの請求書明細（内部商品は展開しない）", () => {
  const seeds = buildInvoiceLineDraftsFromCaseSeeds([
    {
      caseProductId: "cp-pkg",
      lineType: "PACKAGE",
      productId: null,
      packageId: "pkg-1",
      description: "蓄電池セット",
      quantity: 1,
      unit: "式",
      unitPriceExTax: 1200000,
    },
  ]);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].line_kind, "package");
  assert.equal(seeds[0].description, "蓄電池セット");
  assert.equal(seeds[0].source_product_id, null);
  assert.equal(seeds[0].source_package_id, "pkg-1");

  const validated = validateAndBuildInvoiceLineInserts(seeds);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines.length, 1);
  assert.equal(validated.lines[0].line_kind, "package");
});

test("商品＋パッケージ", () => {
  const drafts = [packageDraft(), productDraft()];
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines.length, 2);
  assert.equal(validated.lines[0].sort_order, 1);
  assert.equal(validated.lines[1].sort_order, 2);
  assert.equal(sumIncludedLineAmounts(drafts), 1300000);
  const totals = buildInvoiceTotalsFromLines(drafts);
  const expected = calculateInvoiceAmountInclusive(1300000);
  assert.deepEqual(totals, expected);
});

test("任意明細「輸送費」追加", () => {
  const custom = emptyCustomInvoiceLine();
  custom.description = "輸送費";
  custom.quantity = "1";
  custom.unit = "式";
  custom.unit_price_ex_tax = "30000";
  custom.memo = "現場搬入";

  const drafts = [packageDraft(), productDraft(), custom];
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines.length, 3);
  const shipping = validated.lines[2];
  assert.equal(shipping.line_kind, "custom");
  assert.equal(shipping.description, "輸送費");
  assert.equal(shipping.amount_ex_tax, 30000);
  assert.equal(shipping.memo, "現場搬入");
  assert.equal(shipping.case_product_id, null);
  assert.equal(shipping.source_product_id, null);
  assert.equal(shipping.source_package_id, null);

  const totals = buildInvoiceTotalsFromLines(drafts);
  assert.equal(totals.subtotalExTax, 1330000);
  assert.equal(totals.tax, Math.floor(1330000 * 0.1));
  assert.equal(
    totals.invoiceAmountInclusive,
    1330000 + Math.floor(1330000 * 0.1)
  );
});

test("複数明細でも税は請求書単位の floor(subtotal*0.10)", () => {
  // 端数が出やすい単価でも明細ごと課税せず合計1回
  const drafts = [
    productDraft({
      key: "a",
      unit_price_ex_tax: "10001",
      quantity: "3",
    }),
    productDraft({
      key: "b",
      description: "調整",
      unit_price_ex_tax: "333",
      quantity: "1",
    }),
  ];
  const lineSum = sumIncludedLineAmounts(drafts);
  assert.equal(lineSum, 10001 * 3 + 333);
  const totals = buildInvoiceTotalsFromLines(drafts);
  const expected = calculateInvoiceAmountInclusive(lineSum);
  assert.equal(totals.tax, expected.tax);
  assert.equal(totals.tax, Math.floor(Math.floor(lineSum) * 0.1));
});

test("未チェック明細は合計・保存対象外", () => {
  const drafts = [
    packageDraft(),
    productDraft({ included: false }),
  ];
  assert.equal(sumIncludedLineAmounts(drafts), 1200000);
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines.length, 1);
  assert.equal(validated.lines[0].line_kind, "package");
});

test("明細ドラフトから税スナップショット互換値が得られる", () => {
  const drafts = [productDraft()];
  const compat = buildAutofillCompatFromLineDrafts(drafts);
  assert.equal(compat.subtotalExTax, 100000);
  assert.equal(compat.tax, 10000);
  assert.equal(compat.invoiceAmountInclusive, 110000);

  const snap = buildInvoiceTaxSnapshotForSave({
    invoiceAmountTouched: false,
    invoiceAmount: 110000,
    autofill: {
      subtotalExTax: compat.subtotalExTax,
      tax: compat.tax,
      invoiceAmountInclusive: compat.invoiceAmountInclusive,
    },
  });
  assert.equal(snap.source, "autofill");
  assert.equal(snap.subtotal_ex_tax, 100000);
  assert.equal(snap.tax_amount, 10000);
  assert.equal(snap.invoice_amount, 110000);
});

test("過去invoice互換: 明細なしでも print 税表示はヘッダ正式値", () => {
  const display = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 110000,
    subtotalExTax: null,
    taxAmount: null,
  });
  assert.equal(display.source, "legacy_fallback");
  assert.equal(display.invoiceAmountInclusive, 110000);
  assert.equal(display.subtotalExTax, Math.floor(110000 / 1.1));
});

test("スナップショット付きinvoiceは保存税を優先", () => {
  const display = resolveInvoicePrintTaxDisplay({
    invoiceAmount: 110000,
    subtotalExTax: 100000,
    taxAmount: 10000,
  });
  assert.equal(display.source, "snapshot");
  assert.equal(display.subtotalExTax, 100000);
  assert.equal(display.taxAmount, 10000);
});

test("値引き（負単価）の任意明細を許容", () => {
  const drafts = [
    packageDraft(),
    emptyCustomInvoiceLine(),
  ];
  drafts[1].description = "値引き";
  drafts[1].unit_price_ex_tax = "-50000";
  drafts[1].quantity = "1";
  assert.equal(draftAmountExTax(drafts[1]), -50000);
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines[1].amount_ex_tax, -50000);
});

test("品名未入力はエラー", () => {
  const drafts = [productDraft({ description: "  " })];
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, false);
});

test("複数custom明細", () => {
  const a = emptyCustomInvoiceLine();
  a.description = "輸送費";
  a.unit_price_ex_tax = "10000";
  const b = emptyCustomInvoiceLine();
  b.description = "特別送料";
  b.unit_price_ex_tax = "5000";
  b.memo = "遠方";
  const drafts = [a, b];
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines.length, 2);
  assert.equal(validated.lines[1].memo, "遠方");
  const totals = buildInvoiceTotalsFromLines(drafts);
  assert.equal(totals.subtotalExTax, 15000);
  assert.equal(totals.tax, 1500);
  assert.equal(totals.invoiceAmountInclusive, 16500);
});

test("明細合計と手入力invoice_amountが不一致でも明細validateは通る（ヘッダ手修正を許容）", () => {
  const drafts = [productDraft()];
  const lineTotals = buildInvoiceTotalsFromLines(drafts);
  assert.equal(lineTotals.invoiceAmountInclusive, 110000);
  const manualHeaderAmount = 99999;
  assert.notEqual(manualHeaderAmount, lineTotals.invoiceAmountInclusive);
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  // print はヘッダ正式値を優先する既存ルール
  const display = resolveInvoicePrintTaxDisplay({
    invoiceAmount: manualHeaderAmount,
    subtotalExTax: null,
    taxAmount: null,
  });
  assert.equal(display.invoiceAmountInclusive, manualHeaderAmount);
});

test("備考は明細memoと請求全体memoを分離できる（明細側）", () => {
  const drafts = [
    productDraft({ memo: "型番確認済" }),
    emptyCustomInvoiceLine(),
  ];
  drafts[1].description = "現場追加費用";
  drafts[1].unit_price_ex_tax = "8000";
  drafts[1].memo = "当日対応";
  const validated = validateAndBuildInvoiceLineInserts(drafts);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.lines[0].memo, "型番確認済");
  assert.equal(validated.lines[1].memo, "当日対応");
});

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${tests.length} failed`);
  process.exit(1);
}
console.log(`\n${tests.length}/${tests.length} passed`);
