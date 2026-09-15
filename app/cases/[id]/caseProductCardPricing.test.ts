/**
 * 案件詳細・商品カード価格表示の純関数テスト。
 * Run: npx tsx "app/cases/[id]/caseProductCardPricing.test.ts"
 */
import assert from "node:assert/strict";

import {
  parseCaseProductQuantity,
  resolveCaseProductCardPricing,
  resolveCaseProductSupplier,
  resolveSupplierForPurchaseSource,
  sumPackageComponentPurchaseUnit,
} from "./caseProductCardPricing";
import { aggregateOrderedPurchaseByCaseProduct } from "./enrichCaseProductCardPricing";
import {
  formatNullableYenWithReference,
  formatProfitRateWithReference,
  isMasterReferenceProfit,
} from "./productDisplay";

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
  assert.equal(resolved.salesSource, "master");
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
  assert.equal(resolved.purchaseSource, "master");
});

check("0円スナップショットは有効（null扱いしない）", () => {
  const resolved = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: "s1",
    caseSupplierName: "S",
    casePurchasePrice: 0,
    caseSalesPrice: 0,
    caseGrossProfit: 0,
    defaultSupplierId: null,
    defaultSupplierName: "",
    orderedPurchaseAmount: 999,
    orderedSupplierId: "s2",
    orderedSupplierName: "別",
    masterPurchaseUnitPrice: 1,
    masterSalesUnitPrice: 2,
  });
  assert.equal(resolved.purchasePrice, 0);
  assert.equal(resolved.salesPrice, 0);
  assert.equal(resolved.purchaseSource, "case_snapshot");
  assert.equal(resolved.salesSource, "case_snapshot");
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

check("発注金額表示時は案件仕入先より発注仕入先を優先（情報源一致）", () => {
  const resolved = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: "s-case",
    caseSupplierName: "スナップショット仕入先A",
    casePurchasePrice: null,
    caseSalesPrice: 100000,
    caseGrossProfit: null,
    defaultSupplierId: "s-default",
    defaultSupplierName: "標準",
    orderedPurchaseAmount: 90000,
    orderedSupplierId: null,
    orderedSupplierName: "複数仕入先（2社）",
    masterPurchaseUnitPrice: 1,
    masterSalesUnitPrice: null,
  });
  assert.equal(resolved.purchaseSource, "order");
  assert.equal(resolved.purchasePrice, 90000);
  assert.equal(resolved.supplierName, "複数仕入先（2社）");
  assert.equal(
    resolveSupplierForPurchaseSource("order", {
      caseSupplierId: "s-case",
      caseSupplierName: "A",
      orderedSupplierId: null,
      orderedSupplierName: "複数仕入先（2社）",
      defaultSupplierId: "d",
      defaultSupplierName: "D",
    }).supplierName,
    "複数仕入先（2社）"
  );
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

check("A: 同一仕入先で2回発注 → 金額合算・仕入先A", () => {
  const map = aggregateOrderedPurchaseByCaseProduct({
    orders: [
      { id: "o1", status: "発注済", supplierId: "sA", supplierName: "株式会社A" },
      { id: "o2", status: "発注済", supplierId: "sA", supplierName: "株式会社A" },
    ],
    orderItems: [
      { order_id: "o1", case_product_id: "cp1", amount: 50000 },
      { order_id: "o2", case_product_id: "cp1", amount: 40000 },
    ],
  });
  assert.equal(map.get("cp1")?.amount, 90000);
  assert.equal(map.get("cp1")?.supplierId, "sA");
  assert.equal(map.get("cp1")?.supplierName, "株式会社A");
  assert.equal(map.get("cp1")?.supplierCount, 1);
});

check("B: A社+B社で分割発注 → 金額合算・複数仕入先", () => {
  const map = aggregateOrderedPurchaseByCaseProduct({
    orders: [
      { id: "o1", status: "発注済", supplierId: "sA", supplierName: "仕入先A" },
      { id: "o2", status: "発注済", supplierId: "sB", supplierName: "仕入先B" },
    ],
    orderItems: [
      { order_id: "o1", case_product_id: "cp1", amount: 50000 },
      { order_id: "o2", case_product_id: "cp1", amount: 40000 },
    ],
  });
  assert.equal(map.get("cp1")?.amount, 90000);
  assert.equal(map.get("cp1")?.supplierId, null);
  assert.equal(map.get("cp1")?.supplierName, "複数仕入先（2社）");
  assert.equal(map.get("cp1")?.supplierCount, 2);
});

check("C: A社有効+B社取消 → A社のみ（複数にしない）", () => {
  const map = aggregateOrderedPurchaseByCaseProduct({
    orders: [
      { id: "o1", status: "発注済", supplierId: "sA", supplierName: "仕入先A" },
      { id: "o2", status: "取消", supplierId: "sB", supplierName: "仕入先B" },
      { id: "o3", status: "キャンセル", supplierId: "sC", supplierName: "仕入先C" },
    ],
    orderItems: [
      { order_id: "o1", case_product_id: "cp1", amount: 50000 },
      { order_id: "o2", case_product_id: "cp1", amount: 40000 },
      { order_id: "o3", case_product_id: "cp1", amount: 30000 },
    ],
  });
  assert.equal(map.get("cp1")?.amount, 50000);
  assert.equal(map.get("cp1")?.supplierId, "sA");
  assert.equal(map.get("cp1")?.supplierName, "仕入先A");
  assert.equal(map.get("cp1")?.supplierCount, 1);
});

check("D: PACKAGE AMT+COMP → AMTのみ集計（COMPは case_product_id null）", () => {
  const map = aggregateOrderedPurchaseByCaseProduct({
    orders: [
      { id: "o1", status: "発注済", supplierId: "s1", supplierName: "S" },
    ],
    orderItems: [
      // VE_PKG_AMT → case_product に紐づく金額行
      { order_id: "o1", case_product_id: "cp-pkg", amount: 120000 },
      // VE_PKG_COMP → case_product_id null / 0円
      { order_id: "o1", case_product_id: null, amount: 0 },
      { order_id: "o1", case_product_id: null, amount: 50000 },
    ],
  });
  assert.equal(map.get("cp-pkg")?.amount, 120000);
  assert.equal(map.size, 1);
});

check("E: CUSTOM case_product_id null → 商品カードへ混入なし", () => {
  const map = aggregateOrderedPurchaseByCaseProduct({
    orders: [
      { id: "o1", status: "発注済", supplierId: "s1", supplierName: "S" },
    ],
    orderItems: [
      { order_id: "o1", case_product_id: "cp-product", amount: 10000 },
      // [VE_CUSTOM] case_product_id null
      { order_id: "o1", case_product_id: null, amount: 99999 },
    ],
  });
  assert.equal(map.get("cp-product")?.amount, 10000);
  assert.equal(map.size, 1);
  assert.equal(map.has("null" as string), false);
});

check("F: master fallback → 参考表示", () => {
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
    masterPurchaseUnitPrice: 56000,
    masterSalesUnitPrice: 100000,
  });
  assert.equal(resolved.purchaseSource, "master");
  assert.equal(resolved.salesSource, "master");
  assert.equal(isMasterReferenceProfit(resolved.purchaseSource, resolved.salesSource), true);
  assert.equal(
    formatNullableYenWithReference(resolved.purchasePrice, true),
    "56,000円（参考）"
  );
  assert.equal(
    formatNullableYenWithReference(resolved.salesPrice, true),
    "100,000円（参考）"
  );
  assert.equal(
    formatNullableYenWithReference(resolved.grossProfit, true),
    "44,000円（参考）"
  );
  assert.equal(
    formatProfitRateWithReference(resolved.salesPrice, resolved.grossProfit, true),
    "44.0%（参考）"
  );
});

check("G: snapshot / order actual → 不要な参考表示なし", () => {
  const snapshot = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: "s1",
    caseSupplierName: "S",
    casePurchasePrice: 50000,
    caseSalesPrice: 90000,
    caseGrossProfit: 40000,
    defaultSupplierId: null,
    defaultSupplierName: "",
    orderedPurchaseAmount: null,
    orderedSupplierId: null,
    orderedSupplierName: "",
    masterPurchaseUnitPrice: 1,
    masterSalesUnitPrice: 2,
  });
  assert.equal(snapshot.purchaseSource, "case_snapshot");
  assert.equal(snapshot.salesSource, "case_snapshot");
  assert.equal(
    isMasterReferenceProfit(snapshot.purchaseSource, snapshot.salesSource),
    false
  );
  assert.equal(
    formatNullableYenWithReference(snapshot.purchasePrice, false),
    "50,000円"
  );

  const ordered = resolveCaseProductCardPricing({
    quantity: 1,
    caseSupplierId: null,
    caseSupplierName: "",
    casePurchasePrice: null,
    caseSalesPrice: 90000,
    caseGrossProfit: null,
    defaultSupplierId: "s1",
    defaultSupplierName: "S",
    orderedPurchaseAmount: 50000,
    orderedSupplierId: "s9",
    orderedSupplierName: "発注先",
    masterPurchaseUnitPrice: 1,
    masterSalesUnitPrice: null,
  });
  assert.equal(ordered.purchaseSource, "order");
  assert.equal(ordered.salesSource, "case_snapshot");
  assert.equal(
    isMasterReferenceProfit(ordered.purchaseSource, ordered.salesSource),
    false
  );
  assert.equal(
    formatNullableYenWithReference(ordered.purchasePrice, false),
    "50,000円"
  );
  assert.equal(
    formatProfitRateWithReference(ordered.salesPrice, ordered.grossProfit, false),
    "44.4%"
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
