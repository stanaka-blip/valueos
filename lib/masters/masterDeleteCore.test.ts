import assert from "node:assert/strict";

type Row = Record<string, unknown>;

function createFakeClient(seed: Record<string, Row[]>) {
  const rows: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  );
  const deleted: { table: string; id: string }[] = [];

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
            const id = filters.id || val;
            deleted.push({ table, id });
            rows[table] = (rows[table] || []).filter(
              (r) => String(r.id) !== String(id)
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
    });
    const result = await deleteDealerMaster("d3", client as never);
    assert.equal(result.ok, true);
    assert.deepEqual(client.deleted, [{ table: "dealers", id: "d3" }]);
    console.log("OK dealer unused delete");
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

  console.log("All masterDeleteCore tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
