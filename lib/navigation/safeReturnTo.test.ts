import assert from "node:assert/strict";

import {
  resolveBackHref,
  sanitizeValueOsReturnTo,
  withReturnTo,
} from "@/lib/navigation/safeReturnTo";

assert.equal(sanitizeValueOsReturnTo("/cases/abc"), "/cases/abc");
assert.equal(
  sanitizeValueOsReturnTo("/invoices/x?from=case"),
  "/invoices/x?from=case"
);
assert.equal(
  sanitizeValueOsReturnTo("/products?q=pump&status=active"),
  "/products?q=pump&status=active"
);
assert.equal(sanitizeValueOsReturnTo("https://evil.example/"), null);
assert.equal(sanitizeValueOsReturnTo("//evil.example"), null);
assert.equal(sanitizeValueOsReturnTo("/\\evil"), null);
assert.equal(sanitizeValueOsReturnTo("/unknown-root"), null);
assert.equal(sanitizeValueOsReturnTo(""), null);
assert.equal(sanitizeValueOsReturnTo(null), null);

assert.equal(
  withReturnTo("/invoices/1/edit", "/invoices/1?from=case"),
  "/invoices/1/edit?returnTo=%2Finvoices%2F1%3Ffrom%3Dcase"
);
assert.equal(
  resolveBackHref("/cases/1", "/invoices"),
  "/cases/1"
);
assert.equal(
  resolveBackHref("https://evil.example", "/invoices"),
  "/invoices"
);

console.log("safeReturnTo: ok");
