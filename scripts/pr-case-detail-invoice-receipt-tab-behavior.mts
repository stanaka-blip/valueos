import assert from "node:assert/strict";

import { resolveCaseDetailTabId } from "../app/cases/[id]/caseDetailTabs.ts";

assert.equal(resolveCaseDetailTabId("invoice"), "invoice");
assert.equal(resolveCaseDetailTabId("receipt"), "invoice");
assert.equal(resolveCaseDetailTabId("basic"), "basic");
assert.equal(resolveCaseDetailTabId(null), "basic");
assert.equal(resolveCaseDetailTabId("unknown"), "basic");

console.log("invoice-receipt tab behavior checks passed");
