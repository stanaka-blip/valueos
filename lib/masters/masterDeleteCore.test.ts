import assert from "node:assert/strict";

type Row = Record<string, unknown>;

function createFakeClient(seed: Record<string, Row[]>) {
  const rows: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  );
  const deleted: { table: string; filters: Record<string, string> }[] = [];

  function from(table: string) {
    let filters: Record<string, string> = {};
    let mode: "count" | "maybe" | "delete" = "maybe";

    const builder = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head && opts.count === "exact") mode = "count";
        return builder;
      },
      eq(col: string, val: string) {
        filters[col] = val;
        return builder;
      },
      maybeSingle() {
        mode = "maybe";
        const list = rows[table] || [];
        const found = list.find((r) =>
          Object.entries(filters).every(([k, v]) => String(r[k]) === String(v))
        );
        return Promise.resolve({ data: found || null, error: null });
      },
      delete() {
        mode = "delete";
        return {
          eq(col: string, val: string) {
            filters[col] = val;
            deleted.push({ table, filters: { ...filters } });
            rows[table] = (rows[table] || []).filter(
              (r) =>
                !Object.entries(filters).every(
                  ([k, v]) => String(r[k]) === String(v)
                )
            );
            return Promise.resolve({ error: null });
          },
        };
      },
      then(
        resolve: (value: {
          count: number | null;
          error: null;
          data?: unknown;
        }) => void,
        reject?: (e: unknown) => void
      ) {
        try {
          if (mode === "count") {
            const list = rows[table] || [];
            const count = list.filter((r) =>
              Object.entries(filters).every(
                ([k, v]) => String(r[k]) === String(v)
              )
            ).length;
            resolve({ count, error: null });
            return;
          }
          resolve({ count: null, error: null, data: null });
        } catch (e) {
          reject?.(e);
        }
      },
    };
    return builder;
  }

  return { from, deleted, rows };
}

async function main() {
  const {
    deleteDealerMaster,
    deleteContractorMaster,
    deleteManufacturerMaster,
    deletePackageMaster,
  } = await import("./masterDeleteCore");

  {
    const client = createFakeClient({
      dealers: [{ id: "d1" }],
      cases: [{ id: "c1", dealer_id: "d1" }],
      sales_prices: [],
    });
    const result = await deleteDealerMaster("d1", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error_code, "IN_USE");
      assert.match(result.error_message, /案件/);
      assert.match(result.error_message, /利用停止/);
    }
    assert.equal(client.deleted.length, 0);
    console.log("OK dealer in use by cases");
  }

  {
    const client = createFakeClient({
      dealers: [{ id: "d2" }],
      cases: [],
      sales_prices: [{ id: "sp1", dealer_id: "d2" }],
    });
    const result = await deleteDealerMaster("d2", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error_message, /販売価格/);
    console.log("OK dealer in use by sales_prices");
  }

  {
    const client = createFakeClient({
      dealers: [{ id: "d3" }],
      cases: [],
      sales_prices: [],
      dealer_settlements: [],
    });
    const result = await deleteDealerMaster("d3", client as never);
    assert.equal(result.ok, true);
    assert.deepEqual(client.deleted, [
      { table: "dealers", filters: { id: "d3" } },
    ]);
    console.log("OK dealer unused delete");
  }

  {
    const client = createFakeClient({
      dealers: [{ id: "d4" }],
      cases: [],
      sales_prices: [],
      dealer_settlements: [{ id: "ds1", dealer_id: "d4" }],
    });
    const result = await deleteDealerMaster("d4", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error_code, "IN_USE");
      assert.match(result.error_message, /仕切清算/);
    }
    assert.equal(client.deleted.length, 0);
    console.log("OK dealer in use by dealer_settlements");
  }

  {
    const client = createFakeClient({
      manufacturers: [{ id: "m1" }],
      product_series: [{ id: "s1", manufacturer_id: "m1" }],
      products: [],
      packages: [],
    });
    const result = await deleteManufacturerMaster("m1", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error_message, /シリーズ/);
    console.log("OK manufacturer in use by series");
  }

  {
    const client = createFakeClient({
      manufacturers: [{ id: "m2" }],
      product_series: [],
      products: [{ id: "p1", manufacturer_id: "m2" }],
      packages: [],
    });
    const result = await deleteManufacturerMaster("m2", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error_message, /商品/);
    console.log("OK manufacturer in use by products");
  }

  {
    const client = createFakeClient({
      manufacturers: [{ id: "m3" }],
      product_series: [],
      products: [],
      packages: [],
    });
    const result = await deleteManufacturerMaster("m3", client as never);
    assert.equal(result.ok, true);
    console.log("OK manufacturer unused delete");
  }

  {
    const client = createFakeClient({ contractors: [{ id: "c1" }] });
    const result = await deleteContractorMaster("c1", client as never);
    assert.equal(result.ok, true);
    console.log("OK contractor delete (no FK)");
  }

  {
    const client = createFakeClient({ dealers: [] });
    const result = await deleteDealerMaster("missing", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "NOT_FOUND");
    console.log("OK not found");
  }

  // --- package delete ---

  {
    const client = createFakeClient({
      packages: [{ id: "pkg1" }],
      package_items: [
        { id: "pi1", package_id: "pkg1" },
        { id: "pi2", package_id: "pkg1" },
        { id: "piOther", package_id: "other" },
      ],
      case_products: [],
      case_packages: [],
      purchase_prices: [],
      sales_prices: [],
      invoice_line_items: [],
    });
    const result = await deletePackageMaster("pkg1", client as never);
    assert.equal(result.ok, true);
    assert.deepEqual(client.deleted, [
      { table: "package_items", filters: { package_id: "pkg1" } },
      { table: "packages", filters: { id: "pkg1" } },
    ]);
    assert.equal(
      (client.rows.package_items || []).some((r) => r.package_id === "pkg1"),
      false
    );
    assert.equal(
      (client.rows.package_items || []).some((r) => r.id === "piOther"),
      true
    );
    console.log("OK package unused delete (clears package_items)");
  }

  {
    const client = createFakeClient({
      packages: [{ id: "pkg2" }],
      package_items: [],
      case_products: [{ id: "cp1", package_id: "pkg2" }],
      case_packages: [],
      purchase_prices: [],
      sales_prices: [],
    });
    const result = await deletePackageMaster("pkg2", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error_code, "IN_USE");
      assert.match(result.error_message, /利用停止/);
    }
    assert.equal(client.deleted.length, 0);
    console.log("OK package in use by case_products");
  }

  {
    const client = createFakeClient({
      packages: [{ id: "pkg3" }],
      package_items: [],
      case_products: [],
      case_packages: [{ id: "cpack1", package_id: "pkg3" }],
      purchase_prices: [],
      sales_prices: [],
    });
    const result = await deletePackageMaster("pkg3", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "IN_USE");
    assert.equal(client.deleted.length, 0);
    console.log("OK package in use by case_packages");
  }

  {
    const client = createFakeClient({
      packages: [{ id: "pkg4" }],
      package_items: [],
      case_products: [],
      case_packages: [],
      purchase_prices: [{ id: "pp1", package_id: "pkg4" }],
      sales_prices: [],
    });
    const result = await deletePackageMaster("pkg4", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "IN_USE");
    assert.equal(client.deleted.length, 0);
    console.log("OK package in use by purchase_prices");
  }

  {
    const client = createFakeClient({
      packages: [{ id: "pkg5" }],
      package_items: [],
      case_products: [],
      case_packages: [],
      purchase_prices: [],
      sales_prices: [{ id: "sp1", package_id: "pkg5" }],
    });
    const result = await deletePackageMaster("pkg5", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "IN_USE");
    assert.equal(client.deleted.length, 0);
    console.log("OK package in use by sales_prices");
  }

  {
    const client = createFakeClient({
      packages: [{ id: "pkg6" }],
      package_items: [],
      case_products: [],
      case_packages: [],
      purchase_prices: [],
      sales_prices: [],
      invoice_line_items: [{ id: "ili1", source_package_id: "pkg6" }],
    });
    const result = await deletePackageMaster("pkg6", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "IN_USE");
    assert.equal(client.deleted.length, 0);
    console.log("OK package in use by invoice_line_items");
  }

  {
    const client = createFakeClient({ packages: [] });
    const result = await deletePackageMaster("missing", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "NOT_FOUND");
    console.log("OK package not found");
  }

  console.log("All masterDeleteCore tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
