/**
 * PR-B: 案件詳細 明細追加（RPC化）振る舞いテスト（DB非依存）
 * 実行: npx tsx scripts/pr-case-detail-line-add-api-behavior.mts
 */
import assert from "node:assert/strict";

import {
  addCaseLineByCaseIdWithClient,
  buildAppendCaseLinePayload,
} from "../lib/caseLines/addCaseLineCore.ts";
import { validateAddCaseLineBody } from "../lib/caseLines/addCaseLineLogic.ts";
import {
  toSafeCaseLineError,
  toSafeCaseLineSuccess,
} from "../lib/caseLines/safeCaseLineDto.ts";

let failed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log("OK", name))
    .catch((e) => {
      failed += 1;
      console.error("FAIL", name, e);
    });
}

const CASE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PACKAGE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CASE_PRODUCT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function mockRpcClient(handler: (payload: unknown) => unknown) {
  return {
    rpc: async (name: string, args: { payload: unknown }) => {
      assert.equal(name, "append_case_line");
      try {
        return { data: handler(args.payload), error: null };
      } catch (e) {
        return {
          data: null,
          error: { message: e instanceof Error ? e.message : "rpc error" },
        };
      }
    },
  } as unknown as Parameters<typeof addCaseLineByCaseIdWithClient>[3];
}

await check("qty boundaries", () => {
  assert.equal(
    validateAddCaseLineBody({
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 0,
    }).ok,
    false
  );
  assert.equal(
    validateAddCaseLineBody({
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 10000,
    }).ok,
    false
  );
  assert.equal(
    validateAddCaseLineBody({
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 1.5,
    }).ok,
    false
  );
  assert.equal(
    validateAddCaseLineBody({
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 1,
    }).ok,
    true
  );
  assert.equal(
    validateAddCaseLineBody({
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 9999,
    }).ok,
    true
  );
});

await check("payload omits prices and uses URL case_id", () => {
  const built = buildAppendCaseLinePayload(CASE_ID, REQUEST_ID, {
    line_type: "PRODUCT",
    product_id: PRODUCT_ID,
    quantity: 2,
    sales_price: 9999,
    purchase_price: 1111,
    supplier_id: "ignored",
    case_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    request_id: "11111111-1111-4111-8111-111111111111",
  } as never);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.payload.case_id, CASE_ID);
  assert.equal(built.payload.request_id, REQUEST_ID);
  assert.equal(built.payload.product_id, PRODUCT_ID);
  assert.equal("sales_price" in built.payload, false);
  assert.equal("supplier_id" in built.payload, false);
});

await check("PRODUCT success via RPC mapping", async () => {
  const client = mockRpcClient((payload) => {
    const p = payload as Record<string, unknown>;
    assert.equal(p.line_type, "PRODUCT");
    assert.equal(p.case_id, CASE_ID);
    return {
      ok: true,
      status: "COMPLETED",
      request_id: REQUEST_ID,
      case_id: CASE_ID,
      case_product_id: CASE_PRODUCT_ID,
      case_package_id: null,
      line_type: "PRODUCT",
      idempotent_replay: false,
    };
  });
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    REQUEST_ID,
    { line_type: "PRODUCT", product_id: PRODUCT_ID, quantity: 1 },
    client
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.case_product_id, CASE_PRODUCT_ID);
  assert.equal(r.line_type, "PRODUCT");
  assert.equal(r.idempotent_replay, false);
});

await check("PACKAGE empty items mapped from RPC", async () => {
  const client = mockRpcClient(() => ({
    ok: false,
    status: "FAILED",
    request_id: REQUEST_ID,
    error_code: "PACKAGE_ITEMS_NOT_FOUND",
    error_message: "パッケージ構成が登録されていません",
    idempotent_replay: false,
  }));
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    REQUEST_ID,
    { line_type: "PACKAGE", package_id: PACKAGE_ID, quantity: 1 },
    client
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error_code, "PACKAGE_ITEMS_NOT_FOUND");
});

await check("idempotent replay mapping", async () => {
  const client = mockRpcClient(() => ({
    ok: true,
    status: "COMPLETED",
    request_id: REQUEST_ID,
    case_id: CASE_ID,
    case_product_id: CASE_PRODUCT_ID,
    line_type: "PRODUCT",
    idempotent_replay: true,
  }));
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    REQUEST_ID,
    { line_type: "PRODUCT", product_id: PRODUCT_ID, quantity: 1 },
    client
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.idempotent_replay, true);
});

await check("REQUEST_ID_CONFLICT mapping", async () => {
  const client = mockRpcClient(() => ({
    ok: false,
    status: "FAILED",
    request_id: REQUEST_ID,
    error_code: "REQUEST_ID_CONFLICT",
    error_message: "同じリクエストIDで異なる内容は受け付けできません",
  }));
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    REQUEST_ID,
    { line_type: "PRODUCT", product_id: PRODUCT_ID, quantity: 1 },
    client
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error_code, "REQUEST_ID_CONFLICT");
});

await check("safe DTO hides internals / service role", () => {
  const err = toSafeCaseLineError({
    error_code: "LINE_ADD_FAILED",
    error_message:
      "insert into case_products violated constraint SERVICE_ROLE key sk_test",
  });
  assert.equal(err.ok, false);
  assert.ok(!JSON.stringify(err).includes("SERVICE_ROLE"));
  assert.ok(!JSON.stringify(err).includes("constraint"));
  assert.ok(!JSON.stringify(err).includes("insert into"));

  const ok = toSafeCaseLineSuccess({
    case_product_id: CASE_PRODUCT_ID,
    line_type: "PRODUCT",
    request_id: REQUEST_ID,
    idempotent_replay: false,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.request_id, REQUEST_ID);
});

await check("no compensation helpers remain in core", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    new URL("../lib/caseLines/addCaseLineCore.ts", import.meta.url),
    "utf8"
  );
  assert.equal(src.includes("cleanupLineArtifacts"), false);
  assert.equal(src.includes(".delete()"), false);
  assert.ok(src.includes('rpc("append_case_line"'));
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall behavior passed");
