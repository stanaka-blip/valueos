/**
 * 案件登録下書き payload 契約テスト
 * 実行: npx tsx lib/caseRegistrationDrafts/draftPayload.test.ts
 */
import assert from "node:assert/strict";

import {
  assertDraftOwner,
  buildDraftPreviewName,
  createEmptyDraftPayload,
  sanitizeDraftPayload,
} from "./draftPayload";
import { createInitialCaseForm } from "@/app/components/case-registration/types";

{
  const empty = createEmptyDraftPayload(2);
  assert.equal(empty.version, 1);
  assert.equal(empty.step, 2);
  assert.equal(empty.lines.length, 1);
  console.log("OK empty draft payload");
}

{
  assert.equal(
    buildDraftPreviewName({ ...createInitialCaseForm(), customer_name: "田中" }),
    "田中"
  );
  assert.equal(
    buildDraftPreviewName(createInitialCaseForm()),
    "（顧客名未入力）"
  );
  console.log("OK preview name");
}

{
  const base = createEmptyDraftPayload(1);
  const ok = sanitizeDraftPayload(base);
  assert.equal(ok.ok, true);
  const bad = sanitizeDraftPayload({ version: 2 });
  assert.equal(bad.ok, false);
  console.log("OK sanitize");
}

{
  const uid = "11111111-1111-4111-8111-111111111111";
  assert.equal(assertDraftOwner(uid, uid), true);
  assert.equal(
    assertDraftOwner(uid, "22222222-2222-4222-8222-222222222222"),
    false
  );
  assert.equal(assertDraftOwner(null, uid), false);
  console.log("OK owner check");
}

console.log("All draftPayload checks passed");
