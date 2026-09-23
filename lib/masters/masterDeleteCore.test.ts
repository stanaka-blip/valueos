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

/** RPC `delete_unused_package` のインメモリ模擬（atomic + IN_USE 判定） */
function createFakePackageDeleteRpcClient(
  seed: Record<string, Row[]>,
  opts?: { failPackageDelete?: boolean }
) {
  const rows: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  );
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const IN_USE_MSG =
    "このパッケージは既存データで使用されているため削除できません。利用停止してください。";

  function count(table: string, col: string, id: string): number {
    return (rows[table] || []).filter((r) => String(r[col]) === String(id))
      .length;
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push({ name, args });
    if (name !== "delete_unused_package") {
      return {
        data: null,
        error: { message: `unknown rpc ${name}`, code: "PGRST202" },
      };
    }
    const id = String(args.p_package_id || "");
    // snapshot for rollback simulation
    const snapPackages = (rows.packages || []).map((r) => ({ ...r }));
    const snapItems = (rows.package_items || []).map((r) => ({ ...r }));

    const found = (rows.packages || []).find((r) => String(r.id) === id);
    if (!found) {
      return {
        data: {
          ok: false,
          error_code: "NOT_FOUND",
          error_message: "パッケージが見つかりません",
        },
        error: null,
      };
    }
    if (
      count("case_products", "package_id", id) > 0 ||
      count("case_packages", "package_id", id) > 0 ||
      count("purchase_prices", "package_id", id) > 0 ||
      count("sales_prices", "package_id", id) > 0 ||
      count("invoice_line_items", "source_package_id", id) > 0
    ) {
      return {
        data: {
          ok: false,
          error_code: "IN_USE",
          error_message: IN_USE_MSG,
        },
        error: null,
      };
    }

    rows.package_items = (rows.package_items || []).filter(
      (r) => String(r.package_id) !== id
    );
    if (opts?.failPackageDelete) {
      // simulate packages DELETE failure → rollback items
      rows.packages = snapPackages;
      rows.package_items = snapItems;
      return {
        data: {
          ok: false,
          error_code: "DELETE_FAILED",
          error_message: "削除に失敗しました",
        },
        error: null,
      };
    }
    rows.packages = (rows.packages || []).filter((r) => String(r.id) !== id);
    return { data: { ok: true, package_id: id }, error: null };
  }

  return {
    from() {
      throw new Error("package delete must use rpc, not from()");
    },
    rpc,
    rpcCalls,
    rows,
  };
}

async function main() {
  const {
    deleteDealerMaster,
    deleteContractorMaster,
    deleteManufacturerMaster,
    deletePackageMaster,
    parseDeleteUnusedPackageRpcResult,
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

  // --- package delete via atomic RPC ---

  {
    const parsed = parseDeleteUnusedPackageRpcResult({ ok: true });
    assert.equal(parsed.ok, true);
    const inUse = parseDeleteUnusedPackageRpcResult({
      ok: false,
      error_code: "IN_USE",
      error_message: "利用停止してください。",
    });
    assert.equal(inUse.ok, false);
    if (!inUse.ok) assert.equal(inUse.error_code, "IN_USE");
    console.log("OK parseDeleteUnusedPackageRpcResult");
  }

  {
    const client = createFakePackageDeleteRpcClient({
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
    assert.equal(client.rpcCalls.length, 1);
    assert.equal(client.rpcCalls[0]?.name, "delete_unused_package");
    assert.equal(client.rpcCalls[0]?.args.p_package_id, "pkg1");
    assert.equal(
      (client.rows.package_items || []).some((r) => r.package_id === "pkg1"),
      false
    );
    assert.equal(
      (client.rows.package_items || []).some((r) => r.id === "piOther"),
      true
    );
    assert.equal(
      (client.rows.packages || []).some((r) => r.id === "pkg1"),
      false
    );
    console.log("OK package unused delete via RPC (clears package_items)");
  }

  {
    const client = createFakePackageDeleteRpcClient(
      {
        packages: [{ id: "pkgFail" }],
        package_items: [
          { id: "pi1", package_id: "pkgFail" },
          { id: "piKeep", package_id: "other" },
        ],
        case_products: [],
        case_packages: [],
        purchase_prices: [],
        sales_prices: [],
      },
      { failPackageDelete: true }
    );
    const beforeItems = (client.rows.package_items || []).length;
    const result = await deletePackageMaster("pkgFail", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "DELETE_FAILED");
    assert.equal((client.rows.package_items || []).length, beforeItems);
    assert.equal(
      (client.rows.package_items || []).some((r) => r.package_id === "pkgFail"),
      true
    );
    assert.equal(
      (client.rows.packages || []).some((r) => r.id === "pkgFail"),
      true
    );
    console.log("OK package delete failure rolls back package_items");
  }

  {
    const client = createFakePackageDeleteRpcClient({
      packages: [{ id: "pkg2" }],
      package_items: [{ id: "pi1", package_id: "pkg2" }],
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
    assert.equal(
      (client.rows.package_items || []).some((r) => r.package_id === "pkg2"),
      true
    );
    console.log("OK package in use by case_products (items unchanged)");
  }

  {
    const client = createFakePackageDeleteRpcClient({
      packages: [{ id: "pkg3" }],
      package_items: [{ id: "pi1", package_id: "pkg3" }],
      case_products: [],
      case_packages: [{ id: "cpack1", package_id: "pkg3" }],
      purchase_prices: [],
      sales_prices: [],
    });
    const result = await deletePackageMaster("pkg3", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "IN_USE");
    assert.equal(
      (client.rows.package_items || []).some((r) => r.package_id === "pkg3"),
      true
    );
    console.log("OK package in use by case_packages");
  }

  {
    const client = createFakePackageDeleteRpcClient({
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
    console.log("OK package in use by purchase_prices");
  }

  {
    const client = createFakePackageDeleteRpcClient({
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
    console.log("OK package in use by sales_prices");
  }

  {
    const client = createFakePackageDeleteRpcClient({
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
    console.log("OK package in use by invoice_line_items");
  }

  {
    const client = createFakePackageDeleteRpcClient({ packages: [] });
    const result = await deletePackageMaster("missing", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error_code, "NOT_FOUND");
    console.log("OK package not found");
  }

  {
    const client = {
      async rpc() {
        return {
          data: null,
          error: {
            message: "Could not find the function public.delete_unused_package",
            code: "PGRST202",
          },
        };
      },
    };
    const result = await deletePackageMaster("pkgx", client as never);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error_code, "CONFIG_ERROR");
      assert.match(result.error_message, /migration/i);
    }
    console.log("OK package delete RPC missing → CONFIG_ERROR");
  }

  console.log("All masterDeleteCore tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
