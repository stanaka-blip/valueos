/**
 * Case attachments Direct-to-Storage 契約テスト（本番DB書込なし）
 * 実行: node scripts/pr-case-attachments-contract-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.error("FAIL", name, detail);
  }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const migration = read(
  "supabase/migrations/20260808200000_case_attachments.sql"
);
const core = read("lib/caseAttachments/caseAttachmentsCore.ts");
const constants = read("lib/caseAttachments/constants.ts");
const validation = read("lib/caseAttachments/validation.ts");
const clientUpload = read("lib/caseAttachments/clientUpload.ts");
const intentRoute = read("app/api/case-attachments/upload-intents/route.ts");
const completeRoute = read("app/api/case-attachments/complete/route.ts");
const listRoute = read("app/api/cases/[id]/attachments/route.ts");
const signedRoute = read(
  "app/api/case-attachments/[attachmentId]/signed-url/route.ts"
);
const deactivateRoute = read(
  "app/api/case-attachments/[attachmentId]/deactivate/route.ts"
);
const wizard = read("app/components/case-registration/CaseRegistrationWizard.tsx");
const step4 = read("app/components/case-registration/Step4ConfirmForm.tsx");
const tabs = read("app/cases/[id]/caseDetailTabs.ts");
const view = read("app/cases/[id]/CaseDetailView.tsx");
const docs = read("docs/case-attachments-storage.md");
const serverAdmin = read("lib/supabase/serverAdmin.ts");

assert(
  "migration creates case_attachments",
  migration.includes("CREATE TABLE IF NOT EXISTS public.case_attachments")
);
assert(
  "migration creates upload intents",
  migration.includes(
    "CREATE TABLE IF NOT EXISTS public.case_attachment_upload_intents"
  )
);
assert(
  "migration RLS + service_role only",
  migration.includes("ENABLE ROW LEVEL SECURITY") &&
    migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_attachments TO service_role")
);
assert(
  "bucket creation not in table migration (separate)",
  !migration.includes("INSERT INTO storage.buckets")
);

assert(
  "bucket name case-attachments",
  constants.includes('CASE_ATTACHMENTS_BUCKET = "case-attachments"')
);
assert("20MB limit", constants.includes("20 * 1024 * 1024"));
assert("20 files / case", constants.includes("MAX_ATTACHMENTS_PER_CASE = 20"));
assert(
  "100MB total",
  constants.includes("MAX_TOTAL_ATTACHMENT_BYTES_PER_CASE = 100 * 1024 * 1024")
);
assert(
  "short download TTL",
  constants.includes("SIGNED_DOWNLOAD_TTL_SECONDS = 60")
);

assert(
  "path shape cases/{case_id}/{attachment_id}/file.{ext}",
  validation.includes(
    "`cases/${input.caseId}/${input.attachmentId}/${objectName}`"
  ) && validation.includes("`file.${ext}`")
);
assert(
  "storage object name ignores user filename body",
  validation.includes("buildStorageObjectName") &&
    !validation.includes(".replace(/\\s+/g, \" \")")
);
assert(
  "extension + mime both validated",
  validation.includes("ALLOWED_EXTENSIONS") &&
    validation.includes("allowedMimes.includes(mime)")
);

assert(
  "createSignedUploadUrl used server-side",
  core.includes("createSignedUploadUrl") &&
    core.includes('import "server-only"')
);
assert(
  "complete verifies storage object",
  core.includes("OBJECT_NOT_FOUND") && core.includes(".list(")
);
assert(
  "orphan cleanup for expired intents",
  core.includes("cleanupExpiredAttachmentIntents") &&
    core.includes('status: "expired"') &&
    core.includes("byId?.id || byPath?.id")
);
assert(
  "signed download/deactivate require case_id",
  core.includes("expectedCaseId: string") &&
    core.includes("data.case_id !== input.expectedCaseId")
);
assert(
  "complete rechecks case quota",
  core.includes("complete 時点でも件数・合計を再確認")
);
assert(
  "soft-delete only",
  core.includes("is_active: false") &&
    core.includes("deleted_at") &&
    !core.includes(".remove([data.storage_path]") // deactivate では物理削除しない
);
assert(
  "signed download createSignedUrl",
  core.includes("createSignedUrl") &&
    core.includes("SIGNED_DOWNLOAD_TTL_SECONDS")
);
assert(
  "cross-case forbidden check",
  core.includes("この案件の添付ではありません")
);

assert(
  "intent route rejects client storage_path",
  intentRoute.includes("STORAGE_PATH_FORBIDDEN") &&
    intentRoute.includes("requireStaffJsonMutation")
);
assert(
  "complete route uses JSON only",
  completeRoute.includes("requireStaffJsonMutation") &&
    completeRoute.includes("completeUploadIntent")
);
assert("list route staff session", listRoute.includes("requireStaffSessionGet"));
assert(
  "signed-url route CSRF",
  signedRoute.includes("requireStaffJsonMutation")
);
assert(
  "deactivate route soft-delete",
  deactivateRoute.includes("deactivateAttachment")
);

assert(
  "browser uses uploadToSignedUrl (direct storage)",
  clientUpload.includes("uploadToSignedUrl") &&
    clientUpload.includes("/api/case-attachments/upload-intents") &&
    clientUpload.includes("/api/case-attachments/complete")
);
assert(
  "client does not import service role",
  !clientUpload.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !clientUpload.includes("getServiceRoleSupabase")
);
assert(
  "serverAdmin is server-only",
  serverAdmin.includes('import "server-only"')
);

assert(
  "wizard uploads after case_id",
  wizard.includes("runAttachmentUploads") &&
    wizard.includes("setCreatedCaseId(result.case_id)")
);
assert("step4 has AttachmentQueue", step4.includes("AttachmentQueue"));
assert(
  "documents tab",
  tabs.includes('{ id: "documents", label: "資料" }') &&
    view.includes("CaseDocumentsPanel") &&
    view.includes('tab === "documents"')
);
assert(
  "bucket docs separate from PR apply",
  docs.includes("case-attachments") && docs.includes("private")
);
assert(
  "create_case_registration untouched by attachment lib",
  !core.includes("create_case_registration")
);

const unit = spawnSync(
  "npx",
  ["tsx", "lib/caseAttachments/validation.test.ts"],
  { cwd: ROOT, encoding: "utf8" }
);
assert(
  "validation unit tests pass",
  unit.status === 0,
  unit.stdout + unit.stderr
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll case-attachments contract checks passed");
