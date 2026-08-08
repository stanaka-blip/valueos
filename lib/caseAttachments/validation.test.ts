import assert from "node:assert/strict";

import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_CASE,
  MAX_TOTAL_ATTACHMENT_BYTES_PER_CASE,
} from "./constants";
import {
  buildStorageObjectName,
  buildStoragePath,
  validateCaseQuota,
  validateFileMeta,
} from "./validation";

function ok(name: string) {
  console.log("OK", name);
}

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";

{
  const err = validateFileMeta({
    originalFilename: "quote.pdf",
    contentType: "application/pdf",
    byteSize: 1024,
    attachmentType: "estimate",
  });
  assert.equal(err, null);
  ok("pdf + estimate accepts");
}

{
  const err = validateFileMeta({
    originalFilename: "quote.pdf",
    contentType: "image/png",
    byteSize: 1024,
    attachmentType: "estimate",
  });
  assert.ok(err);
  assert.equal(err?.error_code, "INVALID_CONTENT_TYPE");
  ok("mime/extension mismatch rejects");
}

{
  const err = validateFileMeta({
    originalFilename: "archive.zip",
    contentType: "application/zip",
    byteSize: 1024,
    attachmentType: "other",
  });
  assert.ok(err);
  assert.equal(err?.error_code, "INVALID_EXTENSION");
  ok("zip rejects");
}

{
  const err = validateFileMeta({
    originalFilename: "big.pdf",
    contentType: "application/pdf",
    byteSize: MAX_ATTACHMENT_BYTES + 1,
    attachmentType: "other",
  });
  assert.ok(err);
  assert.equal(err?.error_code, "FILE_TOO_LARGE");
  ok("over 20MB rejects");
}

{
  const cases: Array<{ original: string; ext: string }> = [
    { original: "代理店課題分析テンプレート (1).xlsx", ext: "xlsx" },
    { original: "見積書_田中様.pdf", ext: "pdf" },
    { original: "test file.xlsx", ext: "xlsx" },
    { original: "a(b)c.pdf", ext: "pdf" },
    { original: "../../evil.pdf", ext: "pdf" },
    { original: "a/b.pdf", ext: "pdf" },
  ];

  for (const c of cases) {
    const objectName = buildStorageObjectName(c.original);
    assert.equal(objectName, `file.${c.ext}`, c.original);
    assert.match(objectName, /^file\.[a-z0-9]+$/);
    assert.equal(objectName.includes(" "), false);
    assert.equal(objectName.includes("("), false);
    assert.equal(objectName.includes(")"), false);
    assert.equal(objectName.includes("/"), false);
    assert.equal(objectName.includes("\\"), false);
    assert.equal(objectName.includes(".."), false);
    assert.equal(/[^\x20-\x7E]/.test(objectName), false);

    const path = buildStoragePath({
      caseId: CASE_ID,
      attachmentId: ATTACHMENT_ID,
      originalFilename: c.original,
    });
    assert.equal(
      path,
      `cases/${CASE_ID}/${ATTACHMENT_ID}/file.${c.ext}`,
      c.original
    );
    assert.equal(path.includes(c.original), false);
    // path traversal fragments from user input must not appear as path segments
    assert.equal(path.includes("/../"), false);
    assert.equal(path.startsWith("cases/"), true);

    // DB 表示用の元名は validate 後もそのまま保持できること（生成は別）
    assert.ok(c.original.length > 0);
  }
  ok("storage keys are ASCII-safe file.{ext} for japanese/spaces/parens/traversal names");
}

{
  const path = buildStoragePath({
    caseId: CASE_ID,
    attachmentId: ATTACHMENT_ID,
    originalFilename: "代理店課題分析テンプレート (1).xlsx",
  });
  assert.equal(path.endsWith("/file.xlsx"), true);
  assert.equal(path.includes("代理店"), false);
  assert.equal(path.includes(" "), false);
  ok("japanese display name never enters storage path");
}

{
  const err = validateCaseQuota({
    activeCount: MAX_ATTACHMENTS_PER_CASE,
    pendingCount: 0,
    activeBytes: 0,
    pendingBytes: 0,
    nextByteSize: 1,
  });
  assert.ok(err);
  assert.equal(err?.error_code, "CASE_ATTACHMENT_COUNT_LIMIT");
  ok("count limit");
}

{
  const err = validateCaseQuota({
    activeCount: 1,
    pendingCount: 0,
    activeBytes: MAX_TOTAL_ATTACHMENT_BYTES_PER_CASE - 10,
    pendingBytes: 0,
    nextByteSize: 20,
  });
  assert.ok(err);
  assert.equal(err?.error_code, "CASE_ATTACHMENT_SIZE_LIMIT");
  ok("total size limit");
}

console.log("All caseAttachments validation tests passed");
