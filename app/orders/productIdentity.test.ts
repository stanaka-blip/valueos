/**
 * メーカー＋型番表示の契約テスト
 *
 * 実行:
 *   npx tsx --test app/orders/productIdentity.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  displayIdentityValue,
  resolveManufacturerName,
  resolveModelNo,
  resolveProductIdentity,
} from "@/app/orders/productIdentity";

test("resolveManufacturerName / modelNo from nested product", () => {
  const id = resolveProductIdentity({
    model_no: "S22ZTES-W",
    manufacturers: { name: "ダイキン" },
  });
  assert.equal(id.manufacturerName, "ダイキン");
  assert.equal(id.modelNo, "S22ZTES-W");
  assert.equal(resolveManufacturerName([{ name: "三菱" }]), "三菱");
  assert.equal(resolveModelNo({ model_no: "  ABC  " }), "ABC");
  assert.equal(displayIdentityValue(""), "—");
});

test("print page: メーカー+型番, no 商品名 column", () => {
  const source = readFileSync(
    join(process.cwd(), "app/orders/[id]/print/page.tsx"),
    "utf8"
  );
  assert.match(source, />メーカー</);
  assert.match(source, />型番</);
  assert.doesNotMatch(source, />商品名</);
  assert.doesNotMatch(source, /メーカー型番/);
  assert.match(source, /manufacturers/);
});

test("order detail: メーカー+型番, no 商品名 column", () => {
  const source = readFileSync(
    join(process.cwd(), "app/orders/[id]/page.tsx"),
    "utf8"
  );
  assert.match(source, />メーカー</);
  assert.match(source, />型番</);
  assert.doesNotMatch(source, />商品名</);
  assert.doesNotMatch(source, /メーカー型番/);
});

test("case purchase/delivery tabs show maker+model line columns", () => {
  const source = readFileSync(
    join(process.cwd(), "app/cases/[id]/CaseDetailView.tsx"),
    "utf8"
  );
  // 仕入: メーカー 型番 数量 仕入単価 金額
  const purchaseIdx = source.indexOf("function PurchaseTab");
  const deliveryIdx = source.indexOf("function DeliveryTab");
  assert.ok(purchaseIdx > 0 && deliveryIdx > purchaseIdx);
  const purchase = source.slice(purchaseIdx, deliveryIdx);
  for (const col of ["メーカー", "型番", "数量", "仕入単価", "金額"]) {
    assert.match(purchase, new RegExp(col));
  }
  assert.doesNotMatch(purchase, /商品名/);

  const delivery = source.slice(deliveryIdx, deliveryIdx + 8000);
  for (const col of ["メーカー", "型番", "数量", "納品予定", "納品日"]) {
    assert.match(delivery, new RegExp(col));
  }
  assert.doesNotMatch(delivery, /商品名/);
});

test("no メーカー型番 label in order/case purchase surfaces", () => {
  for (const rel of [
    "app/orders/[id]/print/page.tsx",
    "app/orders/[id]/page.tsx",
    "app/orders/[id]/edit/page.tsx",
    "app/cases/[id]/CaseDetailView.tsx",
  ]) {
    const source = readFileSync(join(process.cwd(), rel), "utf8");
    assert.doesNotMatch(source, /メーカー型番/);
  }
});
