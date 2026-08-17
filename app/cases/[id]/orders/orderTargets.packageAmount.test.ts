/**
 * パッケージ仕入単価×数量 → flatten / order_amount
 * Run: npx tsx app/cases/[id]/orders/orderTargets.packageAmount.test.ts
 */
import assert from "node:assert/strict";

import {
  applySupplierMasterUnitPrices,
  buildOrderTargets,
  flattenOrderTargets,
  packageLineAmount,
  scalePackageItemQuantities,
  sumOrderAmount,
  validateOrderTargetsForSave,
  type PackageOrderTarget,
} from "./orderTargets";
import {
  parsePackageAmountMemo,
  parsePackageComponentMemo,
} from "@/lib/orders/orderPackageDisplay";

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

const SUP = "11111111-1111-4111-8111-111111111111";
const P1 = "33333333-3333-4333-8333-333333333333";
const P2 = "33333333-3333-4333-8333-333333333334";
const PKG_MASTER = "44444444-4444-4444-8444-444444444444";

const packages = [
  {
    id: "pkg1",
    package_id: PKG_MASTER,
    case_product_id: "cp-pkg",
    quantity: 1,
    package_name_snapshot: "全負荷単機能11.1kwシステム",
    case_product_purchase_price: null,
    packages: { name: "全負荷単機能11.1kwシステム", default_supplier_id: SUP },
    case_package_items: [
      {
        id: "i1",
        product_id: P1,
        quantity: 1,
        unit_purchase_price: null,
        total_purchase_price: null,
        memo: null,
        is_selected: true,
        is_hidden: false,
        sort_order: 1,
        product_name_snapshot: "ニチコン ESS-U4M1",
        model_no_snapshot: "ESS-U4M1",
        display_name_snapshot: null,
        products: { name: "ニチコン ESS-U4M1", model_no: "ESS-U4M1" },
      },
      {
        id: "i2",
        product_id: P2,
        quantity: 1,
        unit_purchase_price: null,
        total_purchase_price: null,
        memo: null,
        is_selected: true,
        is_hidden: false,
        sort_order: 2,
        product_name_snapshot: "ニチコン ESS-H2H1",
        model_no_snapshot: "ESS-H2H1",
        display_name_snapshot: null,
        products: { name: "ニチコン ESS-H2H1", model_no: "ESS-H2H1" },
      },
    ],
  },
];

function pricedPackage(
  unitPrice: string,
  quantity = "1"
): PackageOrderTarget {
  const targets = buildOrderTargets([], packages);
  assert.equal(targets[0].kind, "PACKAGE");
  if (targets[0].kind !== "PACKAGE") throw new Error("kind");
  return {
    ...targets[0],
    supplier_id: SUP,
    unit_price: unitPrice,
    quantity,
    items: targets[0].items.map((item) => ({
      ...item,
      quantity: String(
        item.unit_component_qty * (Number(quantity) || 1)
      ),
    })),
  };
}

check("132000×1 → flatten order_amount=132000", () => {
  const pkg = pricedPackage("132000", "1");
  assert.equal(packageLineAmount(pkg), 132000);
  const flat = flattenOrderTargets([pkg]);
  assert.equal(sumOrderAmount(flat), 132000);
  const amt = flat.find((l) => l.source === "PACKAGE_AMOUNT");
  const comps = flat.filter((l) => l.source === "PACKAGE_ITEM");
  assert.ok(amt);
  assert.equal(comps.length, 2);
  assert.equal(amt!.unit_price, "132000");
  assert.equal(amt!.quantity, "1");
  assert.ok(parsePackageAmountMemo(amt!.memo));
  for (const c of comps) {
    assert.equal(c.unit_price, "0");
    assert.ok(parsePackageComponentMemo(c.memo));
  }
  const v = validateOrderTargetsForSave([pkg]);
  assert.equal(v.ok, true);
});

check("132000×2 → order_amount=264000", () => {
  const pkg = pricedPackage("132000", "2");
  assert.equal(packageLineAmount(pkg), 264000);
  assert.equal(sumOrderAmount(flattenOrderTargets([pkg])), 264000);
});

check("通常商品＋パッケージ合算", () => {
  const product = buildOrderTargets(
    [
      {
        id: "cp1",
        line_type: "PRODUCT",
        product_id: P1,
        quantity: 1,
        purchase_price: null,
        memo: null,
        products: {
          name: "通常商品",
          model_no: "N",
          default_supplier_id: SUP,
        },
      },
    ],
    []
  )[0];
  assert.equal(product.kind, "PRODUCT");
  if (product.kind !== "PRODUCT") throw new Error("kind");
  const targets = [
    { ...product, supplier_id: SUP, unit_price: "10000" },
    pricedPackage("132000", "1"),
  ];
  assert.equal(sumOrderAmount(flattenOrderTargets(targets)), 142000);
  assert.equal(validateOrderTargetsForSave(targets).ok, true);
});

check("構成部材仕入がNULL/0でもパッケージ単価があれば発注可能", () => {
  const pkg = pricedPackage("132000", "1");
  const v = validateOrderTargetsForSave([pkg]);
  assert.equal(v.ok, true);
  const flat = flattenOrderTargets([pkg]);
  assert.ok(flat.every((l) => l.source !== "PACKAGE_ITEM" || l.unit_price === "0"));
});

check("パッケージ数量変更で構成数量がスケール", () => {
  const pkg = pricedPackage("132000", "1");
  const scaled = scalePackageItemQuantities(pkg, "2");
  assert.equal(scaled.quantity, "2");
  assert.equal(scaled.items[0].quantity, "2");
  assert.equal(scaled.items[1].quantity, "2");
  assert.equal(sumOrderAmount(flattenOrderTargets([scaled])), 264000);
});

check("PACKAGEマスタ単価適用", () => {
  const targets = buildOrderTargets([], packages).map((t) =>
    t.kind === "PACKAGE"
      ? { ...t, supplier_id: SUP, unit_price: "", has_case_snapshot: false }
      : t
  );
  const priced = applySupplierMasterUnitPrices(
    targets,
    new Map(),
    new Map([[SUP, new Map([[PKG_MASTER, 132000]])]])
  );
  assert.equal(priced.targets[0].kind, "PACKAGE");
  if (priced.targets[0].kind !== "PACKAGE") throw new Error("kind");
  assert.equal(priced.targets[0].unit_price, "132000");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll package amount orderTargets checks passed");
