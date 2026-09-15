/**
 * 案件詳細・商品カード価格表示の純関数テスト。
 * Run: npx tsx "app/cases/[id]/caseProductCardPricing.test.ts"
 */
import assert from "node:assert/strict";

import {
  parseCaseProductQuantity,
  resolveCaseProductCardPricing,
  resolveCaseProductSupplier,
  sumPackageComponentPurchaseUnit,
} from "./caseProductCardPricing";
import { aggregateOrderedPurchaseByCaseProduct } from "./enrichCaseProductCardPricing";

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

check("quantity: 小数を受け入れる", () => {
  assert.equal(parseCaseProductQuantity("4.68"), 4.68);
  assert.equal(parseCaseProductQuantity(0), null);
  assert.equal(parseCaseProductQuantity(null), null);
});

check("仕入先: case → order → default の順", () => {
  assert.deepEqual(
    resolveCaseProductSupplier({
      caseSupplierId: "c1",
      caseSupplierName: "案件仕入先",
      orderedSupplierId: "o1",
      orderedSupplierName: "発注仕入先",
      defaultSupplierId: "d1",
      defaultSupplierName: "標準仕入先",
    }),
    { supplierId: "c1", supplierName: "案件仕入先" }
  );
  assert.deepEqual(
    resolveCaseProductSupplier({
      caseSupplierId: null,
      caseSupplierName: "",
      orderedSupplierId: "o1",
      orderedSupplierName: "発注仕入先",
      defaultSupplierId: "d1",
      defaultSupplierName: "標準仕入先",
    }),
    { supplierId: "o1", supplierName: "発注仕入先" }
  );
  assert.deepEqual(
    resolveCaseProductSupplier({
      caseSupplierId: null,
      caseSupplierName: "",
      orderedSupplierId: null,
      orderedSupplierName: "",
      defaultSupplierId: "d1",
      defaultSupplierName: "標準仕入先",
    }),
    { supplierId: "d1", supplierName: "標準仕入先" }
  );
});

check("通常商品: 仕入先あり + マスタ単価あり → 金額表示", () => {
  const resolved = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: null,
    caseSupplierName: "",
    casePurchasePrice: null,
    caseSalesPrice: null,
    caseGrossProfit: null,
    defaultSupplierId: "s1",
    defaultSupplierName: "株式会社○○",
    orderedPurchaseAmount: null,
    orderedSupplierId: null,
    orderedSupplierName: "",
    masterPurchaseUnitPrice: 56000,
    masterSalesUnitPrice: 100000,
  });
  assert.equal(resolved.supplierName, "株式会社○○");
  assert.equal(resolved.purchasePrice, 56000);
  assert.equal(resolved.salesPrice, 100000);
  assert.equal(resolved.grossProfit, 44000);
  assert.equal(resolved.purchaseSource, "master");
});

check("価格なし → null", () => {
  const resolved = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: null,
    caseSupplierName: "",
    casePurchasePrice: null,
    caseSalesPrice: null,
    caseGrossProfit: null,
    defaultSupplierId: "s1",
    defaultSupplierName: "S",
    orderedPurchaseAmount: null,
    orderedSupplierId: null,
    orderedSupplierName: "",
    masterPurchaseUnitPrice: null,
    masterSalesUnitPrice: null,
  });
  assert.equal(resolved.purchasePrice, null);
  assert.equal(resolved.salesPrice, null);
  assert.equal(resolved.grossProfit, null);
});

check("0円マスタは有効", () => {
  const resolved = resolveCaseProductCardPricing({
    quantity: 2,
    caseSupplierId: null,
    caseSupplierName: "",
    casePurchasePrice: null,
    caseSalesPrice: null,
    caseGrossProfit: null,
    defaultSupplierId: "s1",
    defaultSupplierName: "S",
    orderedPurchaseAmount: null,
    orderedSupplierId: null,
    orderedSupplierName: "",
    masterPurchaseUnitPrice: 0,
    masterSalesUnitPrice: 10000,
  });
  assert.equal(resolved.purchasePrice, 0);
  assert.equal(resolved.salesPrice, 20000);
  assert.equal(resolved.grossProfit, 20000);
});

check("スナップショットがある場合はマスタで上書きしない", () => {
  const resolved = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: "s1",
    caseSupplierName: "固定仕入先",
    casePurchasePrice: 50000,
    caseSalesPrice: 90000,
    caseGrossProfit: 40000,
    defaultSupplierId: "s2",
    defaultSupplierName: "別仕入先",
    orderedPurchaseAmount: 99999,
    orderedSupplierId: "s3",
    orderedSupplierName: "発注先",
    masterPurchaseUnitPrice: 1,
    masterSalesUnitPrice: 2,
  });
  assert.equal(resolved.supplierName, "固定仕入先");
  assert.equal(resolved.purchasePrice, 50000);
  assert.equal(resolved.salesPrice, 90000);
  assert.equal(resolved.purchaseSource, "case_snapshot");
  assert.equal(resolved.salesSource, "case_snapshot");
  assert.equal(resolved.grossProfit, 40000);
});

check("スナップショット無し + 発注金額あり → 発注優先", () => {
  const resolved = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: null,
    caseSupplierName: "",
    casePurchasePrice: null,
    caseSalesPrice: null,
    caseGrossProfit: null,
    defaultSupplierId: "s1",
    defaultSupplierName: "S",
    orderedPurchaseAmount: 123456,
    orderedSupplierId: "s9",
    orderedSupplierName: "発注仕入先",
    masterPurchaseUnitPrice: 1,
    masterSalesUnitPrice: 200000,
  });
  assert.equal(resolved.purchasePrice, 123456);
  assert.equal(resolved.purchaseSource, "order");
  assert.equal(resolved.supplierName, "発注仕入先");
  assert.equal(resolved.salesPrice, 200000);
});

check("PACKAGE 構成合計: 全構成あり / 一部欠落", () => {
  const units = new Map<string, number>([
    ["a", 10000],
    ["b", 20000],
  ]);
  assert.equal(
    sumPackageComponentPurchaseUnit(
      [
        { productId: "a", unitComponentQty: 2 },
        { productId: "b", unitComponentQty: 3 },
      ],
      units
    ),
    80000
  );
  assert.equal(
    sumPackageComponentPurchaseUnit(
      [
        { productId: "a", unitComponentQty: 2 },
        { productId: "c", unitComponentQty: 1 },
      ],
      units
    ),
    null
  );
});

check("取消発注の金額は集計しない", () => {
  const map = aggregateOrderedPurchaseByCaseProduct({
    orders: [
      { id: "o1", status: "取消", supplierId: "s1", supplierName: "S" },
      { id: "o2", status: "発注済", supplierId: "s2", supplierName: "T" },
    ],
    orderItems: [
      { order_id: "o1", case_product_id: "c1", amount: 100 },
      { order_id: "o2", case_product_id: "c1", amount: 200 },
    ],
  });
  assert.equal(map.get("c1")?.amount, 200);
  assert.equal(map.get("c1")?.supplierId, "s2");
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll caseProductCardPricing checks passed");
