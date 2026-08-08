import assert from "node:assert/strict";

import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_CASE,
  MAX_TOTAL_ATTACHMENT_BYTES_PER_CASE,
} from "./constants";
import {
  buildStoragePath,
  sanitizeFilename,
  validateCaseQuota,
  validateFileMeta,
} from "./validation";

function ok(name: string) {
  console.log("OK", name);
}

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
  const safe = sanitizeFilename("../../evil name?.pdf");
  assert.equal(safe.includes(".."), false);
  assert.equal(safe.includes("/"), false);
  assert.equal(safe.includes("?"), false);
  ok("sanitizeFilename strips path tricks");
}

{
  const path = buildStoragePath({
    caseId: "11111111-1111-4111-8111-111111111111",
    attachmentId: "22222222-2222-4222-8222-222222222222",
    originalFilename: "見積 書.pdf",
  });
  assert.match(
    path,
    /^cases\/11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\//
  );
  assert.ok(!path.includes(".."));
  ok("storage path server shape");
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
