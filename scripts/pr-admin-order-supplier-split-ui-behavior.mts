/**
 * 管理者発注: orderTargets / createPurchaseOrdersLogic 振る舞いテスト
 * Run: npx tsx scripts/pr-admin-order-supplier-split-ui-behavior.mts
 */
import assert from "node:assert/strict";

import {
  applySupplierMasterUnitPrices,
  buildOrderTargets,
  flattenOrderTargets,
  formatPurchaseOrderSheetLabel,
  generateUniqueOrderNumbers,
  groupLinesBySupplier,
  groupOrderTargetsBySupplier,
  validateOrderTargetsForSave,
} from "../app/cases/[id]/orders/orderTargets.ts";
import {
  buildCreatePurchaseOrdersRpcPayload,
  validateCreatePurchaseOrdersBody,
} from "../lib/purchaseOrders/createPurchaseOrdersLogic.ts";

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

const SUP_A = "11111111-1111-4111-8111-111111111111";
const SUP_B = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333";
const P2 = "33333333-3333-4333-8333-333333333334";
const P3 = "33333333-3333-4333-8333-333333333335";

const products = [
  {
    id: "cp1",
    line_type: "PRODUCT",
    product_id: P1,
    quantity: 1,
    purchase_price: null,
    memo: null,
    products: { name: "商品A", model_no: "A", default_supplier_id: SUP_A },
  },
  {
    id: "cp2",
    line_type: "PRODUCT",
    product_id: P2,
    quantity: 2,
    purchase_price: null,
    memo: null,
    products: { name: "商品B", model_no: "B", default_supplier_id: SUP_B },
  },
];

const packages = [
  {
    id: "pkg1",
    package_id: "44444444-4444-4444-8444-444444444444",
    quantity: 1,
    package_name_snapshot: "PKG",
    packages: { name: "PKG", default_supplier_id: SUP_A },
    case_package_items: [
      {
        id: "i1",
        product_id: P3,
        quantity: 2,
        unit_purchase_price: null,
        total_purchase_price: null,
        memo: null,
        is_selected: true,
        is_hidden: false,
        sort_order: 1,
        product_name_snapshot: "構成C",
        model_no_snapshot: "C",
        display_name_snapshot: null,
        products: { name: "構成C", model_no: "C" },
      },
    ],
  },
];

check("PRODUCT 1件・標準仕入先初期値", () => {
  const targets = buildOrderTargets([products[0]], []);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].kind, "PRODUCT");
  if (targets[0].kind !== "PRODUCT") throw new Error("kind");
  assert.equal(targets[0].supplier_id, SUP_A);
  assert.equal(targets[0].default_supplier_id, SUP_A);
});

check("標準仕入先未設定は空で手動選択可能", () => {
  const targets = buildOrderTargets(
    [
      {
        ...products[0],
        products: {
          name: "商品A",
          model_no: "A",
          default_supplier_id: null,
        },
      },
    ],
    []
  );
  assert.equal(targets[0].supplier_id, "");
  const v = validateOrderTargetsForSave([
    { ...targets[0], supplier_id: SUP_A, unit_price: "100" },
  ]);
  assert.equal(v.ok, true);
});

check("PRODUCT複数・同一仕入先 → orders 1バケット", () => {
  const targets = buildOrderTargets(
    [
      products[0],
      {
        ...products[1],
        products: {
          name: "商品B",
          model_no: "B",
          default_supplier_id: SUP_A,
        },
      },
    ],
    []
  ).map((t) =>
    t.kind === "PRODUCT" ? { ...t, unit_price: "100" } : t
  );
  assert.equal(groupLinesBySupplier(flattenOrderTargets(targets)).length, 1);
});

check("PRODUCT複数・異なる仕入先 → orders 2バケット", () => {
  const targets = buildOrderTargets(products, []).map((t) =>
    t.kind === "PRODUCT" ? { ...t, unit_price: "100" } : t
  );
  assert.equal(groupLinesBySupplier(flattenOrderTargets(targets)).length, 2);
});

check("PACKAGE 1件・構成品に仕入先なし・パッケージ仕入先を引き継ぐ", () => {
  const targets = buildOrderTargets([], packages);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].kind, "PACKAGE");
  if (targets[0].kind !== "PACKAGE") throw new Error("kind");
  assert.equal(targets[0].supplier_id, SUP_A);
  assert.equal(targets[0].items.length, 1);
  // 単価未設定時は構成行のみ（金額行は検証通過後に付く）
  const flat = flattenOrderTargets([
    { ...targets[0], unit_price: "1000" },
  ]);
  assert.equal(flat[0].source, "PACKAGE_AMOUNT");
  assert.equal(flat[0].supplier_id, SUP_A);
  assert.equal(flat[1].source, "PACKAGE_ITEM");
  assert.equal(flat[1].unit_price, "0");
  assert.ok(!("supplier_id" in targets[0].items[0]));
});

check("PRODUCT+PACKAGE混在の振り分け", () => {
  const targets = buildOrderTargets(products, packages).map((t) => {
    if (t.kind === "PRODUCT") return { ...t, unit_price: "100" };
    return { ...t, unit_price: "500" };
  });
  const buckets = groupLinesBySupplier(flattenOrderTargets(targets));
  assert.equal(buckets.length, 2);
  const a = buckets.find((b) => b.supplier_id === SUP_A);
  const b = buckets.find((b) => b.supplier_id === SUP_B);
  // SUP_A: PRODUCT + PACKAGE_AMOUNT + PACKAGE_ITEM
  assert.equal(a?.lines.length, 3);
  assert.equal(b?.lines.length, 1);
});

check("仕入先未選択で保存停止", () => {
  const targets = buildOrderTargets([products[0]], []);
  const v = validateOrderTargetsForSave([
    { ...targets[0], supplier_id: "", unit_price: "100" },
  ]);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected fail");
  assert.match(v.error_message, /仕入先/);
});

check("価格未設定で保存停止", () => {
  const targets = buildOrderTargets([products[0]], []);
  const v = validateOrderTargetsForSave([
    { ...targets[0], unit_price: "" },
  ]);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected fail");
  assert.match(v.error_message, /仕入単価/);
});

check("仕入先変更後の価格再取得適用", () => {
  const targets = buildOrderTargets([products[0]], []).map((t) =>
    t.kind === "PRODUCT"
      ? { ...t, unit_price: "", has_case_snapshot: false }
      : t
  );
  const priced = applySupplierMasterUnitPrices(
    targets,
    new Map([[SUP_A, new Map([[P1, 1500]])]])
  );
  assert.equal(priced.targets[0].kind, "PRODUCT");
  if (priced.targets[0].kind !== "PRODUCT") throw new Error("kind");
  assert.equal(priced.targets[0].unit_price, "1500");
});

check("発注番号重複なし", () => {
  const nos = generateUniqueOrderNumbers("VE-1", 3);
  assert.equal(nos.length, 3);
  assert.equal(new Set(nos).size, 3);
  assert.ok(nos[1].endsWith("-02"));
});

check("UIグループ: 仕入先単位でPACKAGE構造を維持", () => {
  const targets = buildOrderTargets(
    products as never,
    packages as never
  ).map((t) => {
    if (t.kind === "PRODUCT") {
      return {
        ...t,
        unit_price: t.product_id === P1 ? "100" : "200",
        supplier_id: t.default_supplier_id || "",
      };
    }
    return {
      ...t,
      supplier_id: t.default_supplier_id || "",
      unit_price: "50",
    };
  });
  const groups = groupOrderTargetsBySupplier(targets);
  assert.equal(groups.length, 2);
  const groupA = groups.find((g) => g.supplier_id === SUP_A);
  assert.ok(groupA);
  assert.equal(groupA!.targets.length, 2);
  assert.ok(groupA!.targets.some((t) => t.kind === "PRODUCT"));
  assert.ok(groupA!.targets.some((t) => t.kind === "PACKAGE"));
  const pkg = groupA!.targets.find((t) => t.kind === "PACKAGE");
  assert.ok(pkg && pkg.kind === "PACKAGE" && pkg.items.length === 1);
  assert.equal(formatPurchaseOrderSheetLabel(1), "発注書①");
  assert.equal(formatPurchaseOrderSheetLabel(2), "発注書②");
});

check("API logic: 複数仕入先 payload / 仕入先未選択拒否", () => {
  const bad = validateCreatePurchaseOrdersBody({
    order_date: "2026-08-03",
    status: "発注済",
    orders: [
      {
        supplier_id: "",
        order_no: "PO-1",
        items: [{ product_id: P1, quantity: 1, unit_price: 100 }],
      },
    ],
  });
  assert.equal(bad.ok, false);

  const ok = validateCreatePurchaseOrdersBody({
    order_date: "2026-08-03",
    status: "発注済",
    case_status: "発注済",
    orders: [
      {
        supplier_id: SUP_A,
        order_no: "PO-1",
        items: [{ product_id: P1, quantity: 1, unit_price: 100 }],
      },
      {
        supplier_id: SUP_B,
        order_no: "PO-2",
        items: [{ product_id: P2, quantity: 2, unit_price: 50 }],
      },
    ],
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) throw new Error("expected ok");
  const payload = buildCreatePurchaseOrdersRpcPayload(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ok.value
  );
  assert.equal((payload.orders as unknown[]).length, 2);
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll supplier-split behavior checks passed");
