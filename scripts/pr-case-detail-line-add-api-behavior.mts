/**
 * PR-B: 案件詳細 明細追加 API 振る舞い（DBモック）
 * 実行: npx tsx scripts/pr-case-detail-line-add-api-behavior.mts
 */
import assert from "node:assert/strict";

import { addCaseLineByCaseIdWithClient } from "../lib/caseLines/addCaseLineCore.ts";
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
const CASE_PRODUCT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CASE_PACKAGE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PKG_ITEM_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ITEM_PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

type Store = {
  cases: Set<string>;
  products: Set<string>;
  packages: Map<string, Record<string, unknown>>;
  packageItems: Map<string, Array<Record<string, unknown>>>;
  caseProducts: Array<Record<string, unknown>>;
  casePackages: Array<Record<string, unknown>>;
  casePackageItems: Array<Record<string, unknown>>;
  failOn?: string;
};

function createMockClient(store: Store) {
  function from(table: string) {
    const state: {
      filters: Record<string, unknown>;
      payload: unknown;
      op: "select" | "insert" | "delete";
      ascending?: boolean;
    } = { filters: {}, payload: null, op: "select" };

    const builder: Record<string, unknown> = {
      select(..._args: unknown[]) {
        return builder;
      },
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      order(_col: string, opts?: { ascending?: boolean }) {
        state.ascending = opts?.ascending;
        return builder;
      },
      async maybeSingle() {
        if (table === "cases" && state.op === "select") {
          const id = state.filters.id as string;
          return store.cases.has(id)
            ? { data: { id }, error: null }
            : { data: null, error: null };
        }
        if (table === "products" && state.op === "select") {
          const id = state.filters.id as string;
          return store.products.has(id)
            ? { data: { id }, error: null }
            : { data: null, error: null };
        }
        if (table === "packages" && state.op === "select") {
          const id = state.filters.id as string;
          const row = store.packages.get(id);
          return row
            ? { data: row, error: null }
            : { data: null, error: null };
        }
        if (table === "manufacturers" || table === "product_series") {
          return { data: { name: "テスト" }, error: null };
        }
        return { data: null, error: null };
      },
      async single() {
        if (store.failOn === `${table}:insert` && state.op === "insert") {
          return { data: null, error: { message: "forced fail" } };
        }
        if (table === "case_products" && state.op === "insert") {
          const row = {
            id: CASE_PRODUCT_ID,
            ...(state.payload as object),
          };
          store.caseProducts.push(row);
          return { data: row, error: null };
        }
        if (table === "case_packages" && state.op === "insert") {
          const row = {
            id: CASE_PACKAGE_ID,
            ...(state.payload as object),
          };
          store.casePackages.push(row);
          return { data: { id: CASE_PACKAGE_ID }, error: null };
        }
        return { data: null, error: { message: "unexpected single" } };
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        // Thenable for insert() without select / delete / select lists
        Promise.resolve()
          .then(() => execute())
          .then(resolve, reject);
      },
    };

    async function execute() {
      if (table === "package_items" && state.op === "select") {
        const pkgId = state.filters.package_id as string;
        return {
          data: store.packageItems.get(pkgId) || [],
          error: null,
        };
      }
      if (table === "case_package_items" && state.op === "insert") {
        if (store.failOn === "case_package_items:insert") {
          return { data: null, error: { message: "forced items fail" } };
        }
        const rows = Array.isArray(state.payload)
          ? state.payload
          : [state.payload];
        for (const r of rows) {
          store.casePackageItems.push(r as Record<string, unknown>);
        }
        return { data: rows, error: null };
      }
      if (table === "case_package_items" && state.op === "delete") {
        const id = state.filters.case_package_id;
        store.casePackageItems = store.casePackageItems.filter(
          (r) => r.case_package_id !== id
        );
        return { data: null, error: null };
      }
      if (table === "case_packages" && state.op === "delete") {
        const id = state.filters.id;
        store.casePackages = store.casePackages.filter((r) => r.id !== id);
        return { data: null, error: null };
      }
      if (table === "case_products" && state.op === "delete") {
        const id = state.filters.id;
        store.caseProducts = store.caseProducts.filter((r) => r.id !== id);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    // Make builder thenable for await client.from().insert()
    (builder as { then: typeof builder.then }).then = (
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void
    ) => {
      Promise.resolve()
        .then(() => execute())
        .then(resolve, reject);
    };

    return builder;
  }

  return { from } as unknown as Parameters<
    typeof addCaseLineByCaseIdWithClient
  >[2];
}

await check("qty boundaries", () => {
  assert.equal(validateAddCaseLineBody({
    line_type: "PRODUCT",
    product_id: PRODUCT_ID,
    quantity: 0,
  }).ok, false);
  assert.equal(validateAddCaseLineBody({
    line_type: "PRODUCT",
    product_id: PRODUCT_ID,
    quantity: 10000,
  }).ok, false);
  assert.equal(validateAddCaseLineBody({
    line_type: "PRODUCT",
    product_id: PRODUCT_ID,
    quantity: 1.5,
  }).ok, false);
  assert.equal(validateAddCaseLineBody({
    line_type: "PRODUCT",
    product_id: PRODUCT_ID,
    quantity: 1,
  }).ok, true);
  assert.equal(validateAddCaseLineBody({
    line_type: "PRODUCT",
    product_id: PRODUCT_ID,
    quantity: 9999,
  }).ok, true);
});

await check("rejects XOR / manual price", () => {
  assert.equal(
    validateAddCaseLineBody({
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      package_id: PACKAGE_ID,
      quantity: 1,
    }).ok,
    false
  );
  assert.equal(
    validateAddCaseLineBody({
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 1,
      is_manual_price: true,
    }).ok,
    false
  );
});

await check("PRODUCT success with null prices", async () => {
  const store: Store = {
    cases: new Set([CASE_ID]),
    products: new Set([PRODUCT_ID]),
    packages: new Map(),
    packageItems: new Map(),
    caseProducts: [],
    casePackages: [],
    casePackageItems: [],
  };
  const client = createMockClient(store);
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    {
      line_type: "PRODUCT",
      product_id: PRODUCT_ID,
      quantity: 2,
      sales_price: 9999,
      purchase_price: 1111,
      supplier_id: "should-be-ignored",
    },
    client
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.line_type, "PRODUCT");
  assert.equal(r.case_product_id, CASE_PRODUCT_ID);
  assert.equal(store.caseProducts.length, 1);
  const row = store.caseProducts[0];
  assert.equal(row.sales_price, null);
  assert.equal(row.purchase_price, null);
  assert.equal(row.gross_profit, null);
  assert.equal(row.supplier_id, null);
  assert.equal(row.package_id, null);
  assert.equal(row.quantity, 2);
});

await check("PACKAGE success expands items", async () => {
  const store: Store = {
    cases: new Set([CASE_ID]),
    products: new Set(),
    packages: new Map([
      [
        PACKAGE_ID,
        {
          id: PACKAGE_ID,
          name: "標準セット",
          package_code: "P1",
          manufacturer_id: null,
          series_id: null,
          capacity: 1,
          capacity_unit: "台",
          system_type: null,
          warranty_years: 1,
          specification: null,
        },
      ],
    ]),
    packageItems: new Map([
      [
        PACKAGE_ID,
        [
          {
            id: PKG_ITEM_ID,
            product_id: ITEM_PRODUCT_ID,
            quantity: 3,
            requirement_type: "required",
            selection_group: null,
            sort_order: 1,
            display_name: "本体",
            is_hidden: false,
            products: {
              id: ITEM_PRODUCT_ID,
              name: "部材A",
              model_no: "A-1",
              category: "cat",
              product_type: "part",
              unit: "台",
              specification: null,
            },
          },
        ],
      ],
    ]),
    caseProducts: [],
    casePackages: [],
    casePackageItems: [],
  };
  const client = createMockClient(store);
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    { line_type: "PACKAGE", package_id: PACKAGE_ID, quantity: 2 },
    client
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.line_type, "PACKAGE");
  assert.equal(r.case_package_id, CASE_PACKAGE_ID);
  assert.equal(store.caseProducts.length, 1);
  assert.equal(store.casePackages.length, 1);
  assert.equal(store.casePackageItems.length, 1);
  assert.equal(store.casePackageItems[0].quantity, 6);
  assert.equal(store.casePackageItems[0].unit_purchase_price, null);
  assert.equal(store.casePackageItems[0].total_purchase_price, null);
  assert.equal(store.caseProducts[0].sales_price, null);
});

await check("PACKAGE empty items rejected with no inserts", async () => {
  const store: Store = {
    cases: new Set([CASE_ID]),
    products: new Set(),
    packages: new Map([
      [
        PACKAGE_ID,
        {
          id: PACKAGE_ID,
          name: "空セット",
          package_code: null,
          manufacturer_id: null,
          series_id: null,
          capacity: null,
          capacity_unit: null,
          system_type: null,
          warranty_years: null,
          specification: null,
        },
      ],
    ]),
    packageItems: new Map([[PACKAGE_ID, []]]),
    caseProducts: [],
    casePackages: [],
    casePackageItems: [],
  };
  const client = createMockClient(store);
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    { line_type: "PACKAGE", package_id: PACKAGE_ID, quantity: 1 },
    client
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error_code, "PACKAGE_ITEMS_NOT_FOUND");
  assert.equal(store.caseProducts.length, 0);
  assert.equal(store.casePackages.length, 0);
  assert.equal(store.casePackageItems.length, 0);
});

await check("mid-fail cleans up (no residual)", async () => {
  const store: Store = {
    cases: new Set([CASE_ID]),
    products: new Set(),
    packages: new Map([
      [
        PACKAGE_ID,
        {
          id: PACKAGE_ID,
          name: "標準セット",
          package_code: "P1",
          manufacturer_id: null,
          series_id: null,
          capacity: null,
          capacity_unit: null,
          system_type: null,
          warranty_years: null,
          specification: null,
        },
      ],
    ]),
    packageItems: new Map([
      [
        PACKAGE_ID,
        [
          {
            id: PKG_ITEM_ID,
            product_id: ITEM_PRODUCT_ID,
            quantity: 1,
            requirement_type: null,
            selection_group: null,
            sort_order: 0,
            display_name: null,
            is_hidden: false,
            products: {
              id: ITEM_PRODUCT_ID,
              name: "X",
              model_no: null,
              category: null,
              product_type: null,
              unit: null,
              specification: null,
            },
          },
        ],
      ],
    ]),
    caseProducts: [],
    casePackages: [],
    casePackageItems: [],
    failOn: "case_package_items:insert",
  };
  const client = createMockClient(store);
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    { line_type: "PACKAGE", package_id: PACKAGE_ID, quantity: 1 },
    client
  );
  assert.equal(r.ok, false);
  assert.equal(store.caseProducts.length, 0, "case_products residual");
  assert.equal(store.casePackages.length, 0, "case_packages residual");
  assert.equal(store.casePackageItems.length, 0, "items residual");
});

await check("safe DTO hides internals / service role", () => {
  const err = toSafeCaseLineError({
    error_code: "LINE_ADD_FAILED",
    error_message:
      'insert into case_products violated constraint SERVICE_ROLE key sk_test',
  });
  assert.equal(err.ok, false);
  assert.ok(!JSON.stringify(err).includes("SERVICE_ROLE"));
  assert.ok(!JSON.stringify(err).includes("constraint"));
  assert.ok(!JSON.stringify(err).includes("insert into"));

  const ok = toSafeCaseLineSuccess({
    case_product_id: CASE_PRODUCT_ID,
    line_type: "PRODUCT",
  });
  assert.deepEqual(Object.keys(ok).sort(), [
    "case_product_id",
    "line_type",
    "ok",
  ]);
});

await check("case not found", async () => {
  const store: Store = {
    cases: new Set(),
    products: new Set([PRODUCT_ID]),
    packages: new Map(),
    packageItems: new Map(),
    caseProducts: [],
    casePackages: [],
    casePackageItems: [],
  };
  const r = await addCaseLineByCaseIdWithClient(
    CASE_ID,
    { line_type: "PRODUCT", product_id: PRODUCT_ID, quantity: 1 },
    createMockClient(store)
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error_code, "NOT_FOUND");
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall behavior passed");
