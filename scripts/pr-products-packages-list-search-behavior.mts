import assert from "node:assert/strict";

import {
  filterPackageListRows,
  matchesPackageSearch,
  parsePackageListQuery,
} from "../app/packages/packageListQuery.ts";
import {
  filterProductListRows,
  matchesProductSearch,
  parseProductListQuery,
  sortProductListRows,
} from "../app/products/productListQuery.ts";

const products = [
  {
    id: "1",
    name: "太陽光パネルA",
    category: "パネル",
    model_no: "SP-100",
    is_active: true,
    manufacturer_id: "m1",
    manufacturerName: "Alpha電機",
  },
  {
    id: "2",
    name: "蓄電池B",
    category: "蓄電",
    model_no: "BT-200",
    is_active: false,
    manufacturer_id: "m2",
    manufacturerName: "Beta製作所",
  },
  {
    id: "3",
    name: "太陽光パネルC",
    category: "パネル",
    model_no: "SP-300",
    is_active: "true",
    manufacturer_id: "m1",
    manufacturerName: "Alpha電機",
  },
];

assert.equal(matchesProductSearch(products[0], "SP-100"), true);
assert.equal(matchesProductSearch(products[0], "パネルA"), true);
assert.equal(matchesProductSearch(products[0], "Alpha"), true);
assert.equal(matchesProductSearch(products[0], "Beta"), false);

assert.deepEqual(
  filterProductListRows(products, parseProductListQuery({ q: "SP-" })).map(
    (r) => r.id
  ),
  ["1", "3"]
);

assert.deepEqual(
  filterProductListRows(
    products,
    parseProductListQuery({ manufacturer_id: "m2" })
  ).map((r) => r.id),
  ["2"]
);

assert.deepEqual(
  filterProductListRows(
    products,
    parseProductListQuery({ category: "パネル" })
  ).map((r) => r.id),
  ["1", "3"]
);

assert.deepEqual(
  filterProductListRows(
    products,
    parseProductListQuery({ status: "active" })
  ).map((r) => r.id),
  ["1", "3"]
);

assert.deepEqual(
  filterProductListRows(
    products,
    parseProductListQuery({ status: "inactive" })
  ).map((r) => r.id),
  ["2"]
);

assert.deepEqual(
  filterProductListRows(
    products,
    parseProductListQuery({
      q: "パネル",
      manufacturer_id: "m1",
      category: "パネル",
      status: "active",
    })
  ).map((r) => r.id),
  ["1", "3"]
);

assert.equal(
  filterProductListRows(
    products,
    parseProductListQuery({ q: "存在しない型番XYZ" })
  ).length,
  0
);

assert.equal(parseProductListQuery({}).status, "all");

const sorted = sortProductListRows(products);
assert.equal(sorted[0].manufacturerName, "Alpha電機");
assert.equal(sorted[0].model_no, "SP-100");

const packages = [
  {
    id: "p1",
    name: "住宅向けセット",
    is_active: true,
    manufacturer_id: "m1",
    manufacturerName: "Alpha電機",
    seriesName: "Home",
  },
  {
    id: "p2",
    name: "産業向けセット",
    is_active: false,
    manufacturer_id: "m2",
    manufacturerName: "Beta製作所",
    seriesName: "Industry",
  },
];

assert.equal(matchesPackageSearch(packages[0], "住宅"), true);
assert.equal(matchesPackageSearch(packages[0], "Alpha"), true);
assert.equal(matchesPackageSearch(packages[0], "Home"), true);
assert.equal(matchesPackageSearch(packages[0], "Industry"), false);

assert.deepEqual(
  filterPackageListRows(
    packages,
    parsePackageListQuery({ q: "産業", status: "inactive" })
  ).map((r) => r.id),
  ["p2"]
);

assert.equal(
  filterPackageListRows(
    packages,
    parsePackageListQuery({ manufacturer_id: "m1", status: "active" })
  ).length,
  1
);

assert.equal(parsePackageListQuery({}).status, "all");

console.log("products/packages list search behavior checks passed");
