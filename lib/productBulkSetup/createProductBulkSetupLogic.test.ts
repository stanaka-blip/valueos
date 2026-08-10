import assert from "node:assert/strict";

import {
  buildCreateProductBulkSetupRpcPayload,
  remapProductBulkFieldErrors,
  validateCreateProductBulkSetupBody,
} from "./createProductBulkSetupLogic";

function ok(name: string) {
  console.log("OK", name);
}

{
  const r = validateCreateProductBulkSetupBody({
    manufacturer_id: "11111111-1111-4111-8111-111111111111",
    category: "蓄電池",
    products: [
      { model_no: "A-1", name: "蓄電池本体", capacity: "10kWh", unit: "台" },
    ],
  });
  assert.equal(r.ok, true);
  ok("1 product valid");
}

{
  const products = Array.from({ length: 10 }, (_, i) => ({
    model_no: `M-${i + 1}`,
    name: `商品${i + 1}`,
    unit: "台",
    is_active: true,
  }));
  const r = validateCreateProductBulkSetupBody({
    manufacturer_id: "11111111-1111-4111-8111-111111111111",
    category: "太陽光",
    products,
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.products.length, 10);
  ok("10 products valid");
}

{
  const r = validateCreateProductBulkSetupBody({
    manufacturer_id: "11111111-1111-4111-8111-111111111111",
    products: [
      { model_no: "DUP", name: "A" },
      { model_no: "dup", name: "B" },
    ],
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error_message, /型番/);
    assert.ok(r.field_errors?.["products.1.model_no"]);
  }
  ok("duplicate model_no rejected");
}

{
  const r = validateCreateProductBulkSetupBody({
    manufacturer_id: "11111111-1111-4111-8111-111111111111",
    products: [{ model_no: "", name: "名前だけ" }],
  });
  assert.equal(r.ok, false);
  ok("missing model_no rejected");
}

{
  const r = validateCreateProductBulkSetupBody({
    manufacturer_id: "11111111-1111-4111-8111-111111111111",
    purchase_prices: [{ supplier_id: "x" }],
    products: [{ model_no: "A", name: "B" }],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error_message, /価格/);
  ok("price fields rejected");
}

{
  const payload = buildCreateProductBulkSetupRpcPayload(
    "22222222-2222-4222-8222-222222222222",
    {
      manufacturer_id: "11111111-1111-4111-8111-111111111111",
      category: "部材",
      series_id: null,
      products: [{ model_no: "X", name: "Y", is_active: true }],
    }
  );
  assert.equal(payload.request_id, "22222222-2222-4222-8222-222222222222");
  assert.ok(Array.isArray(payload.products));
  assert.equal(
    (payload.products as { model_no: string }[])[0].model_no,
    "X"
  );
  assert.equal("purchase_prices" in payload, false);
  assert.equal("sales_prices" in payload, false);
  ok("rpc payload has no prices");
}

{
  // UI rows: [empty, filled0, empty, filled1] → payload indices 0,1 map to UI 1,3
  const remapped = remapProductBulkFieldErrors(
    {
      "products.0.model_no": "行1: 型番は必須です",
      "products.1.name": "行2: 商品名は必須です",
      manufacturer_id: "メーカーを選択してください",
    },
    [1, 3]
  );
  assert.equal(remapped["products.1.model_no"], "行1: 型番は必須です");
  assert.equal(remapped["products.3.name"], "行2: 商品名は必須です");
  assert.equal(remapped.manufacturer_id, "メーカーを選択してください");
  assert.equal(remapped["products.0.model_no"], undefined);
  ok("field error indices remap to UI rows");
}

{
  const r = validateCreateProductBulkSetupBody({
    manufacturer_id: "not-a-uuid",
    products: [{ model_no: "A", name: "B" }],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.field_errors?.manufacturer_id);
  ok("invalid manufacturer uuid rejected");
}

{
  const r = validateCreateProductBulkSetupBody({
    manufacturer_id: "11111111-1111-4111-8111-111111111111",
    series_id: "bad",
    products: [{ model_no: "A", name: "B" }],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.field_errors?.series_id);
  ok("invalid series uuid rejected");
}

console.log("All createProductBulkSetupLogic tests passed");
